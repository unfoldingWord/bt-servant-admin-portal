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
    return errorResponse(
      `Engine enqueue failed (${engineRes.status}): ${text}`,
      502
    );
  }

  const data = await engineRes.json();
  return jsonResponse(data);
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
    return errorResponse(
      `Engine poll failed (${engineRes.status}): ${text}`,
      502
    );
  }

  const data = await engineRes.json();
  return jsonResponse(data);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat/stream" && request.method === "POST") {
      return handleEnqueue(request, env);
    }

    if (url.pathname === "/api/chat/stream/poll" && request.method === "GET") {
      return handlePoll(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return errorResponse("Not found", 404);
    }

    // Non-API routes are handled by the static asset serving (SPA mode)
    return new Response("Not found", { status: 404 });
  },
};
