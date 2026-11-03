export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  // Engine admin bearer for /api/v1/admin/*. Optional: when unset or
  // blank, admin calls fall back to ENGINE_API_KEY. Unrelated to
  // ADMIN_SECRET below. Read it only through engineFetch()/engineAdminKey().
  ADMIN_API_KEY?: string;
  BARUCH_BASE_URL: string;
  BARUCH_API_KEY: string;
  BARUCH?: Fetcher;
  AUTH_KV: KVNamespace;
  // The portal's own bootstrap auth (X-Admin-Secret on /api/admin/users).
  // Unrelated to ADMIN_API_KEY above.
  ADMIN_SECRET: string;
  // #311 — optional so a deploy without the vars degrades to "not
  // configured" instead of a type error; see worker/share-config.ts.
  WHATSAPP_NUMBER?: string;
  WHATSAPP_ORG?: string;
}

/** Engine paths under this prefix are admin routes and get the admin key. */
export const ENGINE_ADMIN_PATH_PREFIX = "/api/v1/admin/";

// One fallback warning per isolate: enough to show a missing secret in the
// logs without repeating it on every request.
let adminKeyFallbackLogged = false;

/** Test hook: re-arm the once-per-isolate fallback warning. */
export function resetEngineAdminKeyLogForTests(): void {
  adminKeyFallbackLogged = false;
}

/**
 * The bearer key for calls to the engine's admin API (`/api/v1/admin/*`):
 * the trimmed ADMIN_API_KEY when it is set and non-blank, otherwise
 * ENGINE_API_KEY, so a deploy without the new secret keeps working. The
 * fallback logs one structured warning per isolate naming the key source,
 * never the key value.
 */
export function engineAdminKey(
  env: Pick<Env, "ADMIN_API_KEY" | "ENGINE_API_KEY">
): string {
  const adminKey = env.ADMIN_API_KEY?.trim();
  if (adminKey) return adminKey;
  if (!adminKeyFallbackLogged) {
    adminKeyFallbackLogged = true;
    console.warn(
      JSON.stringify({
        event: "engine_admin_key_fallback",
        key_source: "ENGINE_API_KEY",
        reason: env.ADMIN_API_KEY === undefined ? "unset" : "blank",
      })
    );
  }
  return env.ENGINE_API_KEY;
}

/**
 * Every BFF call to the engine goes through here. `path` starts with `/`
 * and may carry a query string. Admin paths (`/api/v1/admin/*`) get
 * engineAdminKey(); everything else (chat stream, user history read) gets
 * ENGINE_API_KEY. Any Authorization header in `init` is replaced.
 */
export function engineFetch(
  env: Pick<Env, "ENGINE_BASE_URL" | "ADMIN_API_KEY" | "ENGINE_API_KEY">,
  path: string,
  init: Omit<RequestInit, "headers"> & {
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const key = path.startsWith(ENGINE_ADMIN_PATH_PREFIX)
    ? engineAdminKey(env)
    : env.ENGINE_API_KEY;
  return fetch(`${env.ENGINE_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}` },
  });
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

// Traversal-capable org names — the one shape encodeURIComponent can't
// neutralize (/orgs/../x URL-normalizes past the org scope). Single copy
// because it's enforced at multiple choke points (admin.ts create/move,
// auth.ts login + session validation, config.ts resolveOrg): a hardening
// applied to one inline copy would silently miss the others (#253
// review round 6).
export function isPathShapedOrg(org: string): boolean {
  return org === "." || org === "..";
}
