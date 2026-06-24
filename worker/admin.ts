import { getSessionId, invalidateUserSessions, validateSession } from "./auth";
import { generateSalt, hashPassword, timingSafeEqual } from "./crypto";
import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { LanguageRights, StoredUser } from "./types";

// Accepts `"*"` or an array of non-empty trimmed strings. Returns `undefined`
// when the input is unset so the caller can treat that as "leave existing
// value alone". Shared by `language_rights` (legacy) and the four verb-perms
// fields added in #181 — they all use the same `LanguageRights` shape.
// `fieldName` is interpolated into error messages so a bad `mode_edit_rights`
// payload doesn't surface as a misleading "language_rights" error.
function parseRights(
  value: unknown,
  fieldName: string
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
          error: `${fieldName} array entries must be strings`,
        };
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: `${fieldName} array entries must be non-empty`,
        };
      }
      cleaned.push(trimmed);
    }
    return { ok: true, value: cleaned };
  }
  return {
    ok: false,
    error: `${fieldName} must be "*" or an array of strings`,
  };
}

// The four verb-perms fields share `parseRights`'s shape. Listing them as
// `[bodyKey, storedKey]` so the create/update handlers can loop instead of
// repeating five near-identical parse blocks. `language_rights` (legacy)
// stays out of this table; it's parsed inline because its lazy-migration
// role is different.
const VERB_PERMS_FIELDS = [
  "language_edit_rights",
  "language_publish_rights",
  "mode_edit_rights",
  "mode_publish_rights",
] as const;
type VerbPermsField = (typeof VERB_PERMS_FIELDS)[number];

// ---------------------------------------------------------------------------
// Auth — tri-mode
// ---------------------------------------------------------------------------
//
// Three authentication paths are accepted:
//
//   1. **X-Admin-Secret** — a Cloudflare Worker secret. Cross-org super admin.
//      Used by CLI/curl for bootstrap and recovery (creating the very first
//      user, fixing a broken admin, etc.). Skips same-origin checks because
//      the caller has no implicit credentials to abuse. Has no self — no
//      self-mutation guards apply.
//
//   2. **Session cookie + isSuperAdmin === true** — browser super admin.
//      Cross-org powers (lift all org filters), can grant/revoke isSuperAdmin
//      on others. Same-origin required. Self-mutation guards apply: cannot
//      self-demote isSuperAdmin (would lock out), cannot self-delete. Can
//      self-demote isAdmin — they keep super powers regardless.
//
//   3. **Session cookie + isAdmin === true** — browser org admin. Org-scoped:
//      the caller can only manage users within their own session.org.
//      Same-origin required. Self-mutation guards apply: cannot self-demote
//      isAdmin (would lock out), cannot self-delete.
//
// isSuperAdmin implies admit-to-admin even if isAdmin is false on the record.

type AdminScope =
  | { kind: "super" }
  | {
      kind: "super-by-session";
      selfEmail: string;
      // Caller's session id, so a self-password-reset can preserve the
      // current browser tab while still invalidating every other session
      // for that email. Mirrors the "org" variant.
      selfSessionId: string | null;
    }
  | {
      kind: "org";
      org: string;
      selfEmail: string;
      selfSessionId: string | null;
    };

// True for any scope with cross-org powers (X-Admin-Secret or
// super-by-session). Used to short-circuit org-filter checks throughout
// the handlers and to gate isSuperAdmin mutations in the body.
function isCrossOrgScope(
  scope: AdminScope
): scope is Exclude<AdminScope, { kind: "org" }> {
  return scope.kind === "super" || scope.kind === "super-by-session";
}

async function requireAdminAuth(
  request: Request,
  env: Env
): Promise<AdminScope | Response> {
  // Path 1: X-Admin-Secret (CLI / cross-org / bootstrap).
  const secret = request.headers.get("X-Admin-Secret");
  if (env.ADMIN_SECRET && secret && timingSafeEqual(secret, env.ADMIN_SECRET)) {
    return { kind: "super" };
  }

  // Paths 2 + 3: session cookie. Same-origin required.
  if (request.headers.get("X-Requested-With") !== "XMLHttpRequest") {
    return errorResponse("Forbidden", 403);
  }

  const session = await validateSession(request, env);
  if (!session) {
    return errorResponse("Forbidden", 403);
  }

  // isSuperAdmin trumps isAdmin — super admins pass admin auth even if
  // their isAdmin happens to be false.
  if (session.isSuperAdmin) {
    return {
      kind: "super-by-session",
      selfEmail: session.email,
      selfSessionId: getSessionId(request),
    };
  }

  if (!session.isAdmin) {
    return errorResponse("Forbidden", 403);
  }

  return {
    kind: "org",
    org: session.org,
    selfEmail: session.email,
    selfSessionId: getSessionId(request),
  };
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
    isSuperAdmin: user.isSuperAdmin ?? false,
    language_rights: user.language_rights,
    language_edit_rights: user.language_edit_rights,
    language_publish_rights: user.language_publish_rights,
    mode_edit_rights: user.mode_edit_rights,
    mode_publish_rights: user.mode_publish_rights,
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
    isSuperAdmin?: boolean;
    language_rights?: unknown;
    language_edit_rights?: unknown;
    language_publish_rights?: unknown;
    mode_edit_rights?: unknown;
    mode_publish_rights?: unknown;
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

  // Only cross-org scopes may grant isSuperAdmin. Reject loud (don't drop
  // silently) so UI bugs surface and so an org admin trying to escalate
  // gets a clear failure rather than thinking it worked.
  if (body.isSuperAdmin !== undefined && !isCrossOrgScope(scope)) {
    return errorResponse("Cannot grant isSuperAdmin from your scope", 403);
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    return errorResponse(passwordError, 400);
  }

  const rightsResult = parseRights(body.language_rights, "language_rights");
  if (!rightsResult.ok) {
    return errorResponse(rightsResult.error, 400);
  }

  const verbPerms: Partial<Record<VerbPermsField, LanguageRights | undefined>> =
    {};
  for (const field of VERB_PERMS_FIELDS) {
    const result = parseRights(body[field], field);
    if (!result.ok) {
      return errorResponse(result.error, 400);
    }
    verbPerms[field] = result.value;
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
    isSuperAdmin: body.isSuperAdmin ?? false,
    language_rights: rightsResult.value,
    language_edit_rights: verbPerms.language_edit_rights,
    language_publish_rights: verbPerms.language_publish_rights,
    mode_edit_rights: verbPerms.mode_edit_rights,
    mode_publish_rights: verbPerms.mode_publish_rights,
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
    isSuperAdmin?: boolean;
    language_rights?: unknown;
    language_edit_rights?: unknown;
    language_publish_rights?: unknown;
    mode_edit_rights?: unknown;
    mode_publish_rights?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  // Only cross-org scopes may grant or revoke isSuperAdmin. Reject loud
  // (don't drop silently) so UI bugs surface and so an org admin trying to
  // self-escalate or strip another's super gets a clear failure.
  if (body.isSuperAdmin !== undefined && !isCrossOrgScope(scope)) {
    return errorResponse("Cannot modify isSuperAdmin from your scope", 403);
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

  // Self-demote isAdmin guard (org scope only). Super-by-session can
  // self-demote isAdmin without locking out — they retain super powers
  // either way. X-Admin-Secret has no self.
  if (
    scope.kind === "org" &&
    scope.selfEmail === email &&
    body.isAdmin === false
  ) {
    return errorResponse("Cannot demote yourself", 400);
  }

  // Self-demote isSuperAdmin guard (super-by-session only). Without this,
  // a super-admin could PUT isSuperAdmin: false on themselves and drop to
  // an org admin in their own org — losing cross-org powers. X-Admin-Secret
  // remains the recovery escape.
  if (
    scope.kind === "super-by-session" &&
    scope.selfEmail === email &&
    body.isSuperAdmin === false
  ) {
    return errorResponse("Cannot demote yourself from super admin", 400);
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
  if (body.isSuperAdmin !== undefined) {
    user.isSuperAdmin = body.isSuperAdmin;
  }
  // `!== undefined` (not truthy) so `{ password: "" }` falls into the
  // policy check and rejects with "at least 8 characters" rather than
  // silently no-op'ing and returning success.
  const passwordChanged = body.password !== undefined;
  if (passwordChanged) {
    const passwordError = validatePasswordPolicy(body.password as string);
    if (passwordError) {
      return errorResponse(passwordError, 400);
    }
    user.salt = generateSalt();
    user.passwordHash = await hashPassword(body.password as string, user.salt);
  }
  if (body.language_rights !== undefined) {
    const rightsResult = parseRights(body.language_rights, "language_rights");
    if (!rightsResult.ok) {
      return errorResponse(rightsResult.error, 400);
    }
    user.language_rights = rightsResult.value;
  }
  for (const field of VERB_PERMS_FIELDS) {
    if (body[field] === undefined) continue;
    const result = parseRights(body[field], field);
    if (!result.ok) {
      return errorResponse(result.error, 400);
    }
    user[field] = result.value;
  }

  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));

  // After a password change, every existing session for the target user
  // must be invalidated so the new password is actually required to
  // continue. Preserve the caller's own session when they're resetting
  // their own password via the cookie path; the X-Admin-Secret CLI path
  // has no caller session to preserve.
  if (passwordChanged) {
    const exceptSessionId =
      (scope.kind === "org" || scope.kind === "super-by-session") &&
      scope.selfEmail === email
        ? scope.selfSessionId
        : null;
    await invalidateUserSessions(env, email, exceptSessionId);
  }

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

  // Self-delete guard (cookie path only — org or super-by-session). The
  // X-Admin-Secret CLI is the recovery path if a self-delete is genuinely
  // needed.
  if (
    (scope.kind === "org" || scope.kind === "super-by-session") &&
    scope.selfEmail === email
  ) {
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
