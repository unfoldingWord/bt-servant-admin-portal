import type { Env } from "./helpers";
import { errorResponse, jsonResponse, listKvKeys } from "./helpers";
import type { SessionData, StoredUser } from "./types";

const CLIENT_ID = "admin-portal";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The user_id override exists for the test-chat panel: the portal mints a
// synthetic UUID per session (ui-store testChatUserId) so test
// conversations don't touch the caller's own history. Synthetic and real
// IDs are indistinguishable by shape — portal user IDs are ALSO
// crypto.randomUUID() (worker/admin.ts) — so shape alone was an IDOR:
// any authenticated user could read or delete a colleague's history/
// memory by passing their user ID, and under the trusted-portal model
// (single shared engine key) this worker is the only enforcement point
// (#253 review). An override is therefore rejected when it matches any
// OTHER portal user's stored id; synthetic test IDs match nobody and
// pass. The per-request scan over user records mirrors what
// /api/admin/users already does per list call — org user counts are
// small. Residual: engine-side IDs the portal doesn't store (e.g.
// messaging end-users) can't be checked here.
async function resolveUserId(
  env: Env,
  override: string | null | undefined,
  session: SessionData
): Promise<{ userId: string } | { error: Response }> {
  if (!override || !UUID_V4_RE.test(override)) {
    return { userId: session.userId };
  }
  if (override === session.userId) {
    return { userId: override };
  }
  const keys = await listKvKeys(env.AUTH_KV, "user:");
  for (const key of keys) {
    const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
    if (user?.id === override) {
      return {
        error: errorResponse("user_id may not target another user", 403),
      };
    }
  }
  return { userId: override };
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

  const resolvedUser = await resolveUserId(env, body.user_id, session);
  if ("error" in resolvedUser) return resolvedUser.error;

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat/stream`;
  const engineBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: resolvedUser.userId,
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
    console.error(
      `Engine stream failed (${engineRes.status}) ${engineUrl}: ${text}`
    );
    return errorResponse("Failed to stream chat response", 502);
  }

  return new Response(engineRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
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

  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const params = new URLSearchParams({ limit, offset });
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/orgs/${encodeURIComponent(session.org)}/users/${userId}/history?${params.toString()}`;

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
  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(session.org)}/users/${userId}/history`;

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
  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(session.org)}/users/${userId}/memory`;

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
