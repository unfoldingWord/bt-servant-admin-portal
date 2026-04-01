import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { SessionData } from "./types";

const CLIENT_ID = "admin-portal";

// Use service binding when available (avoids Cloudflare orange-to-orange
// subrequest restrictions); fall back to plain fetch for staging/prod.
function baruchFetch(
  env: Env,
  url: string,
  init?: RequestInit
): Promise<Response> {
  if (env.BARUCH) {
    return env.BARUCH.fetch(new Request(url, init));
  }
  return fetch(url, init);
}

export async function handleBaruchStream(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
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

  const baruchUrl = `${env.BARUCH_BASE_URL}/api/v1/chat`;
  const baruchBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: session.userId,
    org: session.org,
    client_id: CLIENT_ID,
    is_admin: session.isAdmin,
  };

  const baruchRes = await baruchFetch(env, baruchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${env.BARUCH_API_KEY}`,
    },
    body: JSON.stringify(baruchBody),
  });

  if (!baruchRes.ok) {
    const text = await baruchRes.text().catch(() => "");
    console.error(`Baruch stream failed (${baruchRes.status}): ${text}`);
    return errorResponse("Failed to stream chat response", 502);
  }

  return new Response(baruchRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export async function handleBaruchHistory(
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

  const params = new URLSearchParams({ limit, offset });
  const baruchUrl = `${env.BARUCH_BASE_URL}/api/v1/orgs/${session.org}/users/${session.userId}/history?${params.toString()}`;

  const baruchRes = await baruchFetch(env, baruchUrl, {
    headers: {
      Authorization: `Bearer ${env.BARUCH_API_KEY}`,
    },
  });

  if (!baruchRes.ok) {
    const text = await baruchRes.text().catch(() => "");
    console.error(`Baruch history failed (${baruchRes.status}): ${text}`);
    return errorResponse("Failed to fetch history", 502);
  }

  const data: unknown = await baruchRes.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("entries" in data) ||
    !Array.isArray((data as { entries: unknown }).entries)
  ) {
    console.error("Baruch history returned unexpected shape:", data);
    return errorResponse("Unexpected Baruch response", 502);
  }

  return jsonResponse(data);
}

export async function handleBaruchInitiate(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const baruchUrl = `${env.BARUCH_BASE_URL}/api/v1/chat/initiate`;
  const baruchBody = {
    user_id: session.userId,
    org: session.org,
    client_id: CLIENT_ID,
    is_admin: session.isAdmin,
  };

  const baruchRes = await baruchFetch(env, baruchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${env.BARUCH_API_KEY}`,
    },
    body: JSON.stringify(baruchBody),
  });

  if (!baruchRes.ok) {
    const text = await baruchRes.text().catch(() => "");
    console.error(`Baruch initiate failed (${baruchRes.status}): ${text}`);
    return errorResponse("Failed to initiate conversation", 502);
  }

  return new Response(baruchRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export async function handleBaruchDeleteHistory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const baruchUrl = `${env.BARUCH_BASE_URL}/api/v1/orgs/${session.org}/users/${session.userId}/history`;

  const baruchRes = await baruchFetch(env, baruchUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.BARUCH_API_KEY}`,
    },
  });

  if (!baruchRes.ok) {
    const text = await baruchRes.text().catch(() => "");
    console.error(
      `Baruch delete history failed (${baruchRes.status}): ${text}`
    );
    return errorResponse("Failed to delete history", 502);
  }

  return jsonResponse({ success: true });
}
