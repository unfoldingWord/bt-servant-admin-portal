import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { SessionData } from "./types";

const CLIENT_ID = "admin-portal";

// Only accept user_id overrides that are valid UUID v4 (from crypto.randomUUID).
// This prevents IDOR — real user IDs from the auth system are not UUIDs.
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveUserId(
  override: string | null | undefined,
  session: SessionData
): string {
  if (override && UUID_V4_RE.test(override)) return override;
  return session.userId;
}

export async function handleStream(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: { message?: string; message_type?: string; user_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.message) {
    return errorResponse("Missing 'message' field", 400);
  }

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat`;
  const engineBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: resolveUserId(body.user_id, session),
    org: session.org,
    client_id: CLIENT_ID,
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
    console.error(`Engine stream failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to stream chat response", 502);
  }

  return new Response(engineRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function handleHistory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
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

  const userId = resolveUserId(url.searchParams.get("user_id"), session);
  const params = new URLSearchParams({ limit, offset });
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/orgs/${session.org}/users/${userId}/history?${params.toString()}`;

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

export async function handleDeleteHistory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const userId = resolveUserId(url.searchParams.get("user_id"), session);
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${session.org}/users/${userId}/history`;

  const engineRes = await fetch(engineUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(
      `Engine delete history failed (${engineRes.status}): ${text}`
    );
    return errorResponse("Failed to delete history", 502);
  }

  return jsonResponse({ success: true });
}

export async function handleDeleteMemory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const userId = resolveUserId(url.searchParams.get("user_id"), session);
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${session.org}/users/${userId}/memory`;

  const engineRes = await fetch(engineUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine delete memory failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to delete memory", 502);
  }

  return jsonResponse({ success: true });
}
