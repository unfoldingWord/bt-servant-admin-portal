export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  // The engine admin key, sent on every engine call. Optional in code: when
  // unset or blank the BFF falls back to ENGINE_API_KEY (see
  // createEngineKeyResolver). Unrelated to ADMIN_SECRET below.
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

export type EngineKeySource = "ADMIN_API_KEY" | "ENGINE_API_KEY";

/**
 * Builds a resolver for the key the BFF sends to the engine. Every BFF
 * call comes from the admin portal (the chat relay included: it sends the
 * admin `client_id`), so every call uses the same key: the trimmed
 * ADMIN_API_KEY when it is set and non-blank, otherwise ENGINE_API_KEY so
 * a deploy without the new secret keeps working. The fallback logs one
 * structured warning per resolver (one per isolate for the module-level
 * instance below) naming the key source, never the key value.
 *
 * A factory rather than module state so tests get a fresh warning flag.
 */
export function createEngineKeyResolver() {
  let fallbackLogged = false;
  return (
    env: Pick<Env, "ADMIN_API_KEY" | "ENGINE_API_KEY">
  ): { key: string; source: EngineKeySource } => {
    const adminKey = env.ADMIN_API_KEY?.trim();
    if (adminKey) return { key: adminKey, source: "ADMIN_API_KEY" };
    if (!fallbackLogged) {
      fallbackLogged = true;
      console.warn(
        JSON.stringify({
          event: "engine_admin_key_fallback",
          key_source: "ENGINE_API_KEY",
          reason: env.ADMIN_API_KEY === undefined ? "unset" : "blank",
        })
      );
    }
    // Sent exactly as today (untrimmed) so the fallback changes nothing.
    return { key: env.ENGINE_API_KEY, source: "ENGINE_API_KEY" };
  };
}

const resolveEngineKey = createEngineKeyResolver();

/** The bearer key the BFF sends on every engine call. */
export function engineAdminKey(
  env: Pick<Env, "ADMIN_API_KEY" | "ENGINE_API_KEY">
): string {
  return resolveEngineKey(env).key;
}

/** Marker in the engine's 403 body when a route needs the admin key. */
const ADMIN_KEY_REQUIRED_MARKER = "requires the admin API key";

export const ENGINE_KEY_REJECTED_MESSAGE =
  "Portal configuration problem: BT Servant rejected the portal's key. This is not about your account's permissions; please contact unfoldingWord.";

/**
 * Every BFF call to the engine goes through here. `path` starts with `/`
 * and may carry a query string. Any Authorization header in `init` is
 * replaced with engineAdminKey().
 *
 * A 403 that says the admin key is required, or any 403 while on the
 * ENGINE_API_KEY fallback, means the portal's key setup is wrong rather
 * than the user lacking rights: it is logged as engine_admin_key_rejected
 * (key source only) and turned into a 502 with a message saying so, so
 * the UI does not show it as "you lack permission".
 */
export async function engineFetch(
  env: Pick<Env, "ENGINE_BASE_URL" | "ADMIN_API_KEY" | "ENGINE_API_KEY">,
  path: string,
  init: Omit<RequestInit, "headers"> & {
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { key, source } = resolveEngineKey(env);
  const res = await fetch(`${env.ENGINE_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}` },
  });
  if (res.status !== 403) return res;
  const body = await res
    .clone()
    .text()
    .catch(() => "");
  if (source === "ADMIN_API_KEY" && !body.includes(ADMIN_KEY_REQUIRED_MARKER)) {
    return res;
  }
  console.error(
    JSON.stringify({
      event: "engine_admin_key_rejected",
      key_source: source,
      method: init.method ?? "GET",
      path: path.split("?")[0],
    })
  );
  return errorResponse(ENGINE_KEY_REJECTED_MESSAGE, 502);
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
