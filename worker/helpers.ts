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

// Structured codes the engine may return on a key rejection, with the
// current error texts as a fallback for engines that predate the codes.
const KEY_REJECTION_TEXTS: [code: string, text: string][] = [
  ["admin_key_required", "requires the admin API key"],
  ["invalid_api_key", "Invalid API key"],
];

/** The engine's key-rejection code from a 401/403 body, if any. */
function keyRejectionCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    if (typeof parsed.code === "string") return parsed.code;
  } catch {
    // Not JSON: fall through to the text match.
  }
  return KEY_REJECTION_TEXTS.find(([, text]) => body.includes(text))?.[0];
}

/**
 * Diagnostic only: on an engine 401/403 that names the key (a structured
 * code or a known error text), or on any 401/403 while on the
 * ENGINE_API_KEY fallback, log engine_admin_key_rejected with the key
 * source, status, method, path and code. Never the key.
 */
async function logKeyRejection(
  res: Response,
  source: EngineKeySource,
  method: string,
  path: string
): Promise<void> {
  if (res.status !== 401 && res.status !== 403) return;
  const body = await res
    .clone()
    .text()
    .catch(() => "");
  const code = keyRejectionCode(body);
  if (source === "ADMIN_API_KEY" && code === undefined) return;
  console.error(
    JSON.stringify({
      event: "engine_admin_key_rejected",
      key_source: source,
      status: res.status,
      method,
      path: path.split("?")[0],
      ...(code !== undefined && { code }),
    })
  );
}

/**
 * Every BFF call to the engine goes through here. `path` starts with `/`
 * and may carry a query string. Any Authorization header in `init` is
 * replaced with the resolved engine key. The engine's response is returned
 * unchanged, so callers' own error handling applies as before.
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
  await logKeyRejection(res, source, init.method ?? "GET", path);
  return res;
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
