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

// Collection segment → placeholder for the segment that follows it.
const ROUTE_PARAMS = new Map<string, string>([
  ["orgs", ":org"],
  ["users", ":userId"],
  ["modes", ":mode"],
  ["languages", ":language"],
  ["mcp-servers", ":serverId"],
  ["groups", ":chatId"],
  ["threads", ":threadId"],
]);

/**
 * The route template of an engine path, for logs: query dropped and ids,
 * org names and slugs replaced by placeholders, e.g.
 * `/api/v1/admin/orgs/:org/users/:userId/memory`. Walks the segments by
 * index: a collection segment is emitted with the placeholder for the
 * NEXT segment and that segment is skipped, so a param value that happens
 * to equal a collection name (an org called `users`, a mode called
 * `languages`) never shifts the templating.
 */
export function engineRoute(path: string): string {
  const segments = (path.split("?")[0] ?? "").split("/");
  const out: string[] = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i] ?? "";
    const param = ROUTE_PARAMS.get(seg);
    const next = segments[i + 1];
    if (param !== undefined && next !== undefined && next !== "") {
      out.push(seg, param);
      i += 2;
    } else {
      out.push(seg);
      i += 1;
    }
  }
  return out.join("/");
}

/** Engine host plus route template: what the BFF logs for an engine call. */
export function engineCallLabel(
  env: Pick<Env, "ENGINE_BASE_URL">,
  path: string
): string {
  return `${env.ENGINE_BASE_URL}${engineRoute(path)}`;
}

/**
 * Every BFF call to the engine goes through here. `path` starts with `/`
 * and may carry a query string. The Authorization header is set to the
 * resolved engine key, replacing any in `init`. The engine's response is
 * returned unchanged and its body is never read here, so callers' own
 * error handling applies as before. An engine 401/403 is logged as a
 * neutral engine_auth_error (key source, status, method, route template;
 * never the key).
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
  if (res.status === 401 || res.status === 403) {
    console.error(
      JSON.stringify({
        event: "engine_auth_error",
        key_source: source,
        status: res.status,
        method: init.method ?? "GET",
        route: engineRoute(path),
      })
    );
  }
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
