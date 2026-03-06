import { generateSalt, hashPassword, timingSafeEqual } from "./crypto";
import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { StoredUser } from "./types";

// ---------------------------------------------------------------------------
// Admin secret guard
// ---------------------------------------------------------------------------

function requireAdminSecret(request: Request, env: Env): Response | null {
  const secret = request.headers.get("X-Admin-Secret");
  if (
    !env.ADMIN_SECRET ||
    !secret ||
    !timingSafeEqual(secret, env.ADMIN_SECRET)
  ) {
    return errorResponse("Forbidden", 403);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    org: user.org,
    isAdmin: user.isAdmin ?? false,
  };
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

async function createUser(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: {
    email?: string;
    password?: string;
    name?: string;
    org?: string;
    isAdmin?: boolean;
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
  };

  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));

  return jsonResponse({ user: safeUser(user) }, 201);
}

async function listUsers(request: Request, env: Env): Promise<Response> {
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
      return user ? safeUser(user) : null;
    })
  );

  return jsonResponse({ users: users.filter(Boolean) });
}

async function updateUser(
  request: Request,
  env: Env,
  email: string
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

  let body: {
    name?: string;
    org?: string;
    password?: string;
    isAdmin?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
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
    user.salt = generateSalt();
    user.passwordHash = await hashPassword(body.password, user.salt);
  }

  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));

  return jsonResponse({ user: safeUser(user) });
}

async function deleteUser(
  request: Request,
  env: Env,
  email: string
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const existing = await env.AUTH_KV.get(`user:${email}`);
  if (!existing) {
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
  const blocked = requireAdminSecret(request, env);
  if (blocked) return blocked;

  if (pathname === "/api/admin/users") {
    if (request.method === "POST") return createUser(request, env);
    if (request.method === "GET") return listUsers(request, env);
    return errorResponse("Method not allowed", 405);
  }

  const match = pathname.match(/^\/api\/admin\/users\/(.+)$/);
  if (match?.[1]) {
    const email = decodeURIComponent(match[1]).toLowerCase();
    if (request.method === "PUT") return updateUser(request, env, email);
    if (request.method === "DELETE") return deleteUser(request, env, email);
    return errorResponse("Method not allowed", 405);
  }

  return errorResponse("Not found", 404);
}
