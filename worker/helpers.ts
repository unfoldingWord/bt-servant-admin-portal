export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  BARUCH_BASE_URL: string;
  BARUCH_API_KEY: string;
  BARUCH?: Fetcher;
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

// Paginated KV key listing — the AUTH_KV store has no secondary indexes,
// so every "all users" / "all sessions" operation is a prefix scan. One
// shared loop (rd-3 review: three hand-rolled copies had accumulated in
// admin.ts, auth.ts, and rights-migration.ts) so a future change to
// list semantics — an org index, error handling, limits — lands once.
export async function listKvKeys(
  kv: KVNamespace,
  prefix: string
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const list = await kv.list({ prefix, cursor });
    keys.push(...list.keys.map((k) => k.name));
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return keys;
}
