interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  DEFAULT_ORG: string;
}

const ADMIN_USER_ID = "admin-test";
const ADMIN_CLIENT_ID = "admin-portal";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/chat/stream" ||
      url.pathname === "/api/chat/stream/poll" ||
      url.pathname === "/api/chat/history"
    ) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

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
