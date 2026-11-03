export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  // The engine admin key, sent on every engine call. Optional in code: when
  // unset or blank the BFF falls back to ENGINE_API_KEY (see
  // resolveEngineKey). Unrelated to ADMIN_SECRET below.
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

// Warn once per isolate when falling back to ENGINE_API_KEY.
let fallbackWarned = false;

/**
 * The key the BFF sends on every engine call. Every BFF call comes from the
 * admin portal (the chat relay included: it sends the admin `client_id`),
 * so every call uses the trimmed ADMIN_API_KEY when it is set and
 * non-blank. Otherwise ENGINE_API_KEY, sent exactly as today (untrimmed),
 * so a deploy without the new secret keeps working; that fallback logs one
 * warning per isolate naming the key source, never the key value.
 */
export function resolveEngineKey(
  env: Pick<Env, "ADMIN_API_KEY" | "ENGINE_API_KEY">
): {
  key: string;
  source: EngineKeySource;
} {
  const adminKey = env.ADMIN_API_KEY?.trim();
  if (adminKey) return { key: adminKey, source: "ADMIN_API_KEY" };
  if (!fallbackWarned) {
    fallbackWarned = true;
    console.warn(
      JSON.stringify({
        event: "engine_admin_key_fallback",
        key_source: "ENGINE_API_KEY",
        reason: env.ADMIN_API_KEY === undefined ? "unset" : "blank",
      })
    );
  }
  return { key: env.ENGINE_API_KEY, source: "ENGINE_API_KEY" };
}

// Path segment → placeholder for the segment that follows it.
const ROUTE_PARAMS: Record<string, string> = {
  orgs: ":org",
  users: ":userId",
  modes: ":mode",
  languages: ":language",
  "mcp-servers": ":serverId",
  groups: ":chatId",
  threads: ":threadId",
};

/**
 * The route template of an engine path, for logs: query dropped and ids,
 * org names and slugs replaced by placeholders, e.g.
 * `/api/v1/admin/orgs/:org/users/:userId/memory`.
 */
export function engineRoute(path: string): string {
  const segments = (path.split("?")[0] ?? "").split("/");
  return segments
    .map((seg, i) => {
      const prev = i > 0 ? segments[i - 1] : undefined;
      const param = prev !== undefined ? ROUTE_PARAMS[prev] : undefined;
      return param !== undefined && seg !== "" ? param : seg;
    })
    .join("/");
}

/** Engine host plus route template: what the BFF logs for an engine call. */
export function engineCallLabel(
  env: Pick<Env, "ENGINE_BASE_URL">,
  path: string
): string {
  return `${env.ENGINE_BASE_URL}${engineRoute(path)}`;
}

// Known key-rejection codes. Pre-#479 engines send no code; their only
// key-rejection text is "Invalid API key".
const KEY_REJECTION_CODES = new Set(["invalid_api_key", "admin_key_required"]);
const LEGACY_INVALID_KEY_TEXT = "Invalid API key";

/** The engine's key-rejection code from a 401/403 body, if it is a known one. */
function keyRejectionCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    if (typeof parsed.code === "string") {
      return KEY_REJECTION_CODES.has(parsed.code) ? parsed.code : undefined;
    }
  } catch {
    // Not JSON: fall through to the text match.
  }
  return body.includes(LEGACY_INVALID_KEY_TEXT) ? "invalid_api_key" : undefined;
}

const REJECTION_BODY_MAX_BYTES = 4096;
const REJECTION_BODY_MAX_MS = 250;

/**
 * Up to REJECTION_BODY_MAX_BYTES of a clone of the body, giving up after
 * REJECTION_BODY_MAX_MS. Only used for 401/403 (small JSON error bodies);
 * the original response stream is untouched.
 */
async function readCappedClone(res: Response): Promise<string> {
  const reader = res.clone().body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + REJECTION_BODY_MAX_MS;
  try {
    while (text.length < REJECTION_BODY_MAX_BYTES) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), remaining)
        ),
      ]);
      if (chunk === null || chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    // Diagnostic only: an unreadable body just means no code.
  } finally {
    reader.cancel().catch(() => {});
  }
  return text.slice(0, REJECTION_BODY_MAX_BYTES);
}

/**
 * Diagnostic only: on an engine 401/403 with a known key-rejection code,
 * or on any 401/403 while on the ENGINE_API_KEY fallback, log
 * engine_admin_key_rejected with key source, status, method, route
 * template and code. Never the key.
 */
async function logKeyRejection(
  res: Response,
  source: EngineKeySource,
  method: string,
  path: string
): Promise<void> {
  if (res.status !== 401 && res.status !== 403) return;
  const code = keyRejectionCode(await readCappedClone(res));
  if (source === "ADMIN_API_KEY" && code === undefined) return;
  console.error(
    JSON.stringify({
      event: "engine_admin_key_rejected",
      key_source: source,
      status: res.status,
      method,
      route: engineRoute(path),
      ...(code !== undefined && { code }),
    })
  );
}

/**
 * Every BFF call to the engine goes through here. `path` starts with `/`
 * and may carry a query string. The Authorization header is set to the
 * resolved engine key, replacing any in `init`. The engine's response is
 * returned unchanged, so callers' own error handling applies as before;
 * only a 401/403 waits on a capped read for the diagnostic log.
 */
export async function engineFetch(
  env: Pick<Env, "ENGINE_BASE_URL" | "ADMIN_API_KEY" | "ENGINE_API_KEY">,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { key, source } = resolveEngineKey(env);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  const res = await fetch(`${env.ENGINE_BASE_URL}${path}`, {
    ...init,
    headers,
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
