interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  DEFAULT_ORG: string;
  AUTH_KV: KVNamespace;
}

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

const ADMIN_USER_ID = "admin-test";
const ADMIN_CLIENT_ID = "admin-portal";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Lightweight same-origin guard: require X-Requested-With header.
 * Browsers block custom headers on cross-origin requests unless a CORS
 * preflight succeeds, and this worker sends no CORS headers, so external
 * sites cannot call these endpoints.
 */
function requireSameOrigin(request: Request): Response | null {
  if (request.headers.get("X-Requested-With") !== "XMLHttpRequest") {
    return errorResponse("Forbidden", 403);
  }
  return null;
}

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

async function validateSession(
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

const RATE_LIMIT_WINDOW = 300; // 5 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

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
// Auth endpoints
// ---------------------------------------------------------------------------

async function handleLogin(request: Request, env: Env): Promise<Response> {
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

async function handleLogout(request: Request, env: Env): Promise<Response> {
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

async function handleMe(request: Request, env: Env): Promise<Response> {
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

// ---------------------------------------------------------------------------
// Chat endpoints (existing)
// ---------------------------------------------------------------------------

async function handleEnqueue(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: { message?: string; message_type?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.message) {
    return errorResponse("Missing 'message' field", 400);
  }

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat/queue`;
  const engineBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: ADMIN_USER_ID,
    org: env.DEFAULT_ORG,
    client_id: ADMIN_CLIENT_ID,
  };

  const engineRes = await fetch(engineUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
    body: JSON.stringify(engineBody),
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine enqueue failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to enqueue message", 502);
  }

  const data: unknown = await engineRes.json();
  if (!data || typeof data !== "object" || !("message_id" in data)) {
    console.error("Engine enqueue returned unexpected shape:", data);
    return errorResponse("Unexpected engine response", 502);
  }

  return jsonResponse({
    message_id: (data as { message_id: string }).message_id,
  });
}

async function handlePoll(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const messageId = url.searchParams.get("message_id");
  const cursor = url.searchParams.get("cursor") || "";

  if (!messageId) {
    return errorResponse("Missing 'message_id' parameter", 400);
  }

  const params = new URLSearchParams({
    user_id: ADMIN_USER_ID,
    message_id: messageId,
    org: env.DEFAULT_ORG,
    cursor,
  });

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat/queue/poll?${params.toString()}`;

  const engineRes = await fetch(engineUrl, {
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine poll failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to poll events", 502);
  }

  const data: unknown = await engineRes.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("events" in data) ||
    !Array.isArray((data as { events: unknown }).events)
  ) {
    console.error("Engine poll returned unexpected shape:", data);
    return errorResponse("Unexpected engine response", 502);
  }

  const typed = data as {
    events: unknown[];
    done?: boolean;
    cursor?: string;
    message_id?: string;
  };
  return jsonResponse({
    message_id: typed.message_id,
    events: typed.events,
    done: typed.done ?? false,
    cursor: typed.cursor ?? "",
  });
}

async function handleHistory(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const limit = String(
    Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
      100
    )
  );
  const offset = String(
    Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)
  );

  const params = new URLSearchParams({ limit, offset });
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/orgs/${env.DEFAULT_ORG}/users/${ADMIN_USER_ID}/history?${params.toString()}`;

  const engineRes = await fetch(engineUrl, {
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine history failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to fetch history", 502);
  }

  const data: unknown = await engineRes.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("entries" in data) ||
    !Array.isArray((data as { entries: unknown }).entries)
  ) {
    console.error("Engine history returned unexpected shape:", data);
    return errorResponse("Unexpected engine response", 502);
  }

  return jsonResponse(data);
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Auth endpoints — no session required
    if (url.pathname.startsWith("/api/auth/")) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      if (url.pathname === "/api/auth/login") {
        return handleLogin(request, env);
      }
      if (url.pathname === "/api/auth/logout") {
        return handleLogout(request, env);
      }
      if (url.pathname === "/api/auth/me") {
        return handleMe(request, env);
      }
      return errorResponse("Not found", 404);
    }

    // Chat endpoints — session required
    if (
      url.pathname === "/api/chat/stream" ||
      url.pathname === "/api/chat/stream/poll" ||
      url.pathname === "/api/chat/history"
    ) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      // Validate session before processing chat routes
      const session = await validateSession(request, env);
      if (!session) {
        return errorResponse("Unauthorized", 401);
      }

      if (url.pathname === "/api/chat/stream") {
        return handleEnqueue(request, env);
      }
      if (url.pathname === "/api/chat/history") {
        return handleHistory(request, env);
      }
      return handlePoll(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return errorResponse("Not found", 404);
    }

    // Non-API routes are handled by the static asset serving (SPA mode)
    return new Response("Not found", { status: 404 });
  },
};
