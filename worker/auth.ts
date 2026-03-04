import { hashPassword, timingSafeEqual } from "./crypto";
import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { SessionData, StoredUser } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
const RATE_LIMIT_WINDOW = 300; // 5 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/** Per-IP rate limiting via KV using per-attempt keys to avoid race conditions. */
async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  const prefix = `ratelimit:login:${ip}:`;
  const list = await env.AUTH_KV.list({ prefix });

  if (list.keys.length >= RATE_LIMIT_MAX) return true;

  const attemptKey = `${prefix}${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await env.AUTH_KV.put(attemptKey, "1", {
    expirationTtl: RATE_LIMIT_WINDOW,
  });
  return false;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^\s;]+)/);
  return match?.[1] ?? null;
}

function sessionCookie(
  sessionId: string,
  requestUrl: string,
  maxAge = SESSION_TTL
): string {
  const isLocalhost = new URL(requestUrl).hostname === "localhost";
  const parts = [
    `session=${sessionId}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (!isLocalhost) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function validateSession(
  request: Request,
  env: Env
): Promise<SessionData | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const data = await env.AUTH_KV.get<SessionData>(`session:${sessionId}`, {
    type: "json",
  });
  if (!data) return null;

  // Ensure the user still exists (e.g. not deleted by admin)
  const userExists = await env.AUTH_KV.get(`user:${data.email}`);
  if (!userExists) {
    await env.AUTH_KV.delete(`session:${sessionId}`);
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export async function handleLogin(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await isRateLimited(ip, env)) {
    return errorResponse("Too many login attempts. Try again later.", 429);
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return errorResponse("Email and password are required", 400);
  }

  const user = await env.AUTH_KV.get<StoredUser>(`user:${email}`, {
    type: "json",
  });
  if (!user) {
    return errorResponse("Invalid email or password", 401);
  }

  const hash = await hashPassword(password, user.salt);
  if (!timingSafeEqual(hash, user.passwordHash)) {
    return errorResponse("Invalid email or password", 401);
  }

  const sessionId = crypto.randomUUID();
  const sessionData: SessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    org: user.org,
    isAdmin: user.isAdmin ?? false,
    createdAt: new Date().toISOString(),
  };

  await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
    expirationTtl: SESSION_TTL,
  });

  const response = jsonResponse({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      org: user.org,
      isAdmin: user.isAdmin ?? false,
    },
  });
  response.headers.set("Set-Cookie", sessionCookie(sessionId, request.url));
  return response;
}

export async function handleLogout(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.AUTH_KV.delete(`session:${sessionId}`);
  }

  const response = jsonResponse({ ok: true });
  response.headers.set("Set-Cookie", sessionCookie("deleted", request.url, 0));
  return response;
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const session = await validateSession(request, env);
  if (!session) {
    return errorResponse("Unauthorized", 401);
  }

  return jsonResponse({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      org: session.org,
      isAdmin: session.isAdmin ?? false,
    },
  });
}
