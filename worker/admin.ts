import { validateSession } from "./auth";
import { generateSalt, hashPassword, timingSafeEqual } from "./crypto";
import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { LanguageRights, StoredUser } from "./types";

// Accepts `"*"` or an array of non-empty trimmed strings. Returns null if
// the input is unset (caller should treat as "leave existing value alone")
// or a validation error message if the shape is invalid.
function parseLanguageRights(
  value: unknown
):
  | { ok: true; value: LanguageRights | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === "*") return { ok: true, value: "*" };
  if (Array.isArray(value)) {
    const cleaned: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        return {
          ok: false,
          error: "language_rights array entries must be strings",
        };
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: "language_rights array entries must be non-empty",
        };
      }
      cleaned.push(trimmed);
    }
    return { ok: true, value: cleaned };
  }
  return {
    ok: false,
    error: 'language_rights must be "*" or an array of strings',
  };
}

// ---------------------------------------------------------------------------
// Auth — dual-mode
// ---------------------------------------------------------------------------
//
// Two authentication paths are accepted:
//
//   1. **X-Admin-Secret** — a Cloudflare Worker secret. Cross-org "super"
//      admin. Used by CLI/curl for bootstrap and recovery (creating the very
//      first user, fixing a broken admin, etc.). Skips same-origin checks
//      because the caller has no implicit credentials to abuse.
//
//   2. **Session cookie + isAdmin === true** — the browser path. Org-scoped:
//      the caller can only manage users within their own session.org.
//      Same-origin (`X-Requested-With: XMLHttpRequest`) is required to
//      prevent CSRF abuse of the implicit cookie.
//
// Self-mutation guards (cookie path only): an org admin cannot delete or
// demote themselves. The X-Admin-Secret path stays as the recovery escape.

type AdminScope =
  | { kind: "super" }
  | { kind: "org"; org: string; selfEmail: string };

async function requireAdminAuth(
  request: Request,
  env: Env
): Promise<AdminScope | Response> {
  // Path 1: X-Admin-Secret (CLI / cross-org / bootstrap).
  const secret = request.headers.get("X-Admin-Secret");
  if (env.ADMIN_SECRET && secret && timingSafeEqual(secret, env.ADMIN_SECRET)) {
    return { kind: "super" };
  }

  // Path 2: session cookie + isAdmin (browser). Same-origin required.
  if (request.headers.get("X-Requested-With") !== "XMLHttpRequest") {
    return errorResponse("Forbidden", 403);
  }

  const session = await validateSession(request, env);
  if (!session || !session.isAdmin) {
    return errorResponse("Forbidden", 403);
  }

  return { kind: "org", org: session.org, selfEmail: session.email };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Centralized password policy. Mirrors `handleChangePassword` in auth.ts so
// the create / admin-reset / self-change paths all agree on minimum length.
// Returns the error message to surface, or null on pass.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function validatePasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

function safeUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    org: user.org,
    isAdmin: user.isAdmin ?? false,
    language_rights: user.language_rights,
  };
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

async function createUser(
  request: Request,
  env: Env,
  scope: AdminScope
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: {
    email?: string;
    password?: string;
    name?: string;
    org?: string;
    isAdmin?: boolean;
    language_rights?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim();
  const org = body.org?.trim();

  if (!email || !password || !name || !org) {
    return errorResponse("email, password, name, and org are required", 400);
  }

  // Org-scoped admins can only create users in their own org.
  if (scope.kind === "org" && org !== scope.org) {
    return errorResponse(
      `Cannot create user outside your org (${scope.org})`,
      403
    );
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    return errorResponse(passwordError, 400);
  }

  const rightsResult = parseLanguageRights(body.language_rights);
  if (!rightsResult.ok) {
    return errorResponse(rightsResult.error, 400);
  }

  const existing = await env.AUTH_KV.get(`user:${email}`);
  if (existing) {
    return errorResponse("User already exists", 409);
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name,
    org,
    passwordHash,
    salt,
    isAdmin: body.isAdmin ?? false,
    language_rights: rightsResult.value,
  };

  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));

  return jsonResponse({ user: safeUser(user) }, 201);
}

async function listUsers(
  request: Request,
  env: Env,
  scope: AdminScope
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const keys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.AUTH_KV.list({ prefix: "user:", cursor });
    keys.push(...list.keys);
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  const users = await Promise.all(
    keys.map(async (key) => {
      const user = await env.AUTH_KV.get<StoredUser>(key.name, {
        type: "json",
      });
      if (!user) return null;
      // Org-scoped admins only see users in their own org.
      if (scope.kind === "org" && user.org !== scope.org) return null;
      return safeUser(user);
    })
  );

  return jsonResponse({ users: users.filter(Boolean) });
}

async function updateUser(
  request: Request,
  env: Env,
  email: string,
  scope: AdminScope
): Promise<Response> {
  if (request.method !== "PUT") {
    return errorResponse("Method not allowed", 405);
  }

  const user = await env.AUTH_KV.get<StoredUser>(`user:${email}`, {
    type: "json",
  });
  if (!user) {
    return errorResponse("User not found", 404);
  }

  // Org-scoped admins can only see/edit users in their own org. Return 404
  // (not 403) on cross-org targets to avoid leaking existence.
  if (scope.kind === "org" && user.org !== scope.org) {
    return errorResponse("User not found", 404);
  }

  let body: {
    name?: string;
    org?: string;
    password?: string;
    isAdmin?: boolean;
    language_rights?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  // Org-scoped admins cannot move users to another org. Allow no-op
  // (org === scope.org) so PUTs that include the current org are fine.
  if (
    body.org !== undefined &&
    scope.kind === "org" &&
    body.org.trim() !== scope.org
  ) {
    return errorResponse("Cannot move user to another org", 403);
  }

  // Self-demote guard (cookie path only). The X-Admin-Secret CLI is the
  // recovery path if a self-demote is genuinely needed.
  if (
    scope.kind === "org" &&
    scope.selfEmail === email &&
    body.isAdmin === false
  ) {
    return errorResponse("Cannot demote yourself", 400);
  }

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return errorResponse("name cannot be empty", 400);
    }
    user.name = trimmed;
  }
  if (body.org !== undefined) {
    const trimmed = body.org.trim();
    if (!trimmed) {
      return errorResponse("org cannot be empty", 400);
    }
    user.org = trimmed;
  }
  if (body.isAdmin !== undefined) {
    user.isAdmin = body.isAdmin;
  }
  if (body.password) {
    const passwordError = validatePasswordPolicy(body.password);
    if (passwordError) {
      return errorResponse(passwordError, 400);
    }
    user.salt = generateSalt();
    user.passwordHash = await hashPassword(body.password, user.salt);
  }
  if (body.language_rights !== undefined) {
    const rightsResult = parseLanguageRights(body.language_rights);
    if (!rightsResult.ok) {
      return errorResponse(rightsResult.error, 400);
    }
    user.language_rights = rightsResult.value;
  }

  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));

  return jsonResponse({ user: safeUser(user) });
}

async function deleteUser(
  request: Request,
  env: Env,
  email: string,
  scope: AdminScope
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  // Self-delete guard (cookie path only). The X-Admin-Secret CLI is the
  // recovery path if a self-delete is genuinely needed.
  if (scope.kind === "org" && scope.selfEmail === email) {
    return errorResponse("Cannot delete yourself", 400);
  }

  // Need the full record to enforce the org-scope check before deleting.
  const user = await env.AUTH_KV.get<StoredUser>(`user:${email}`, {
    type: "json",
  });
  if (!user) {
    return errorResponse("User not found", 404);
  }
  if (scope.kind === "org" && user.org !== scope.org) {
    return errorResponse("User not found", 404);
  }

  await env.AUTH_KV.delete(`user:${email}`);

  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleAdmin(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const auth = await requireAdminAuth(request, env);
  if (auth instanceof Response) return auth;

  if (pathname === "/api/admin/users") {
    if (request.method === "POST") return createUser(request, env, auth);
    if (request.method === "GET") return listUsers(request, env, auth);
    return errorResponse("Method not allowed", 405);
  }

  const match = pathname.match(/^\/api\/admin\/users\/(.+)$/);
  if (match?.[1]) {
    const email = decodeURIComponent(match[1]).toLowerCase();
    if (request.method === "PUT") return updateUser(request, env, email, auth);
    if (request.method === "DELETE") {
      return deleteUser(request, env, email, auth);
    }
    return errorResponse("Method not allowed", 405);
  }

  return errorResponse("Not found", 404);
}
