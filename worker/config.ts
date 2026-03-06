import type { Env } from "./helpers";
import { errorResponse } from "./helpers";
import type { SessionData } from "./types";

// ---------------------------------------------------------------------------
// Proxy helper — forwards request to Engine API
// ---------------------------------------------------------------------------

async function proxyToEngine(
  request: Request,
  env: Env,
  enginePath: string,
  allowedMethods: string[]
): Promise<Response> {
  if (!allowedMethods.includes(request.method)) {
    return errorResponse("Method not allowed", 405);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.ENGINE_API_KEY}`,
  };

  let body: string | undefined;
  if (request.method === "PUT" || request.method === "POST") {
    headers["Content-Type"] = "application/json";
    try {
      body = JSON.stringify(await request.json());
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
  }

  const engineRes = await fetch(`${env.ENGINE_BASE_URL}${enginePath}`, {
    method: request.method,
    headers,
    body,
  });

  // Pass through the engine response as-is
  return new Response(engineRes.body, {
    status: engineRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Config route handler
// ---------------------------------------------------------------------------

export async function handleConfig(
  request: Request,
  env: Env,
  session: SessionData,
  pathname: string
): Promise<Response> {
  const org = encodeURIComponent(session.org);

  // /api/config/prompt-overrides → GET/PUT/DELETE
  if (pathname === "/api/config/prompt-overrides") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/prompt-overrides`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/modes-default → PUT/DELETE
  if (pathname === "/api/config/modes-default") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/modes-default`,
      ["PUT", "DELETE"]
    );
  }

  // /api/config/modes/{name} → GET/PUT/DELETE
  const modeMatch = pathname.match(/^\/api\/config\/modes\/(.+)$/);
  if (modeMatch?.[1]) {
    const modeName = decodeURIComponent(modeMatch[1]);
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(modeName)}`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/modes → GET
  if (pathname === "/api/config/modes") {
    return proxyToEngine(request, env, `/api/v1/admin/orgs/${org}/modes`, [
      "GET",
    ]);
  }

  return errorResponse("Not found", 404);
}
