import { BFF_AUTH_ERRORS } from "@/types/bff-errors";

export interface Env {
  ENGINE_BASE_URL: string;
  ENGINE_API_KEY: string;
  BARUCH_BASE_URL: string;
  BARUCH_API_KEY: string;
  BARUCH?: Fetcher;
  AUTH_KV: KVNamespace;
  ADMIN_SECRET: string;
  // #311 — optional so a deploy without the vars degrades to "not
  // configured" instead of a type error; see worker/share-config.ts.
  WHATSAPP_NUMBER?: string;
  WHATSAPP_ORG?: string;
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
 * A 401 / 403 the BFF itself generates (the session, same-origin and org
 * checks), with its machine-readable `code` next to `error` (#345; an
 * extra field, so readers of `error` are unaffected). Engine bodies the
 * BFF passes through are never rewritten.
 */
export function authErrorResponse(
  message: string,
  status: 401 | 403
): Response {
  return jsonResponse(
    {
      error: message,
      code:
        status === 401
          ? BFF_AUTH_ERRORS.unauthorized
          : BFF_AUTH_ERRORS.forbidden,
    },
    status
  );
}

/**
 * `decodeURIComponent` for a path segment, or null when the segment holds a
 * malformed escape (`%E0%A4%A`). That is the caller's error, so every
 * /api/config route that decodes a segment answers 400 instead of letting
 * the URIError become a 500.
 */
export function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The 400 for a mode-name path segment `safeDecode` couldn't read. The
 * share-code route answers with its coded counterpart
 * (`shareCodeInvalidModeName` in share-config.ts).
 */
export function invalidModeNameResponse(): Response {
  return errorResponse("Invalid mode name", 400);
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
