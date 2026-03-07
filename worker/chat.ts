import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { SessionData } from "./types";

const CLIENT_ID = "admin-portal";

export async function handleEnqueue(
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

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat/queue`;
  const engineBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: body.user_id || session.userId,
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

export async function handlePoll(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
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
    user_id: url.searchParams.get("user_id") || session.userId,
    message_id: messageId,
    org: session.org,
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

  const userId = url.searchParams.get("user_id") || session.userId;
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
  const userId = url.searchParams.get("user_id") || session.userId;
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
