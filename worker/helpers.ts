export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  AUTH_KV: KVNamespace;
  ADMIN_SECRET: string;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Lightweight same-origin guard: require X-Requested-With header.
 * Browsers block custom headers on cross-origin requests unless a CORS
 * preflight succeeds, and this worker sends no CORS headers, so external
 * sites cannot call these endpoints.
 */
export function requireSameOrigin(request: Request): Response | null {
  if (request.headers.get("X-Requested-With") !== "XMLHttpRequest") {
    return errorResponse("Forbidden", 403);
  }
  return null;
}
