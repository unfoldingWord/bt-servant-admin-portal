import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
}

interface SessionData {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
const RATE_LIMIT_WINDOW = 300; // 5 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2 via Web Crypto)
// ---------------------------------------------------------------------------

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(hexToBuffer(salt)),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return bufferToHex(derived);
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/** Constant-time comparison to prevent timing attacks on hash values. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Per-IP rate limiting via KV. Returns true if the request should be blocked. */
async function isRateLimited(ip: string, env: Env): Promise<boolean> {
  const key = `ratelimit:login:${ip}`;
  const count = parseInt((await env.AUTH_KV.get(key)) || "0", 10);

  if (count >= RATE_LIMIT_MAX) return true;

  await env.AUTH_KV.put(key, String(count + 1), {
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
    createdAt: new Date().toISOString(),
  };

  await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
    expirationTtl: SESSION_TTL,
  });

  const response = jsonResponse({
    user: { id: user.id, email: user.email, name: user.name },
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
    },
  });
}
