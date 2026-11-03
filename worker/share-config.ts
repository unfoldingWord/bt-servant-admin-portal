import type { Env } from "./helpers";
import { engineFetch, invalidOrg, jsonResponse } from "./helpers";
import {
  parseShareCodeAnswer,
  SHARE_CODE_ERRORS,
  type ShareCodeErrorCode,
} from "@/lib/mode-share-code-wire";
import type {
  ModeShareCodeResponse,
  ShareCodeAnswer,
} from "@/types/mode-share-code";

// #311 — read-only share configuration for the per-mode WhatsApp QR.
//
// Two operator-set vars, both from wrangler.jsonc per environment:
//   WHATSAPP_NUMBER — the BT Servant WhatsApp number (E.164). Empty by
//                     default; the portal renders "not configured" until it
//                     is set. The worker's first-contact message (issue #311
//                     part 2) will read the SAME var name from its
//                     wrangler.toml; when it lands, change both together.
//   WHATSAPP_ORG    — the org the WhatsApp gateway is pinned to
//                     (`ENGINE_ORG` in the gateway's wrangler.toml), i.e.
//                     the org every WhatsApp request carries. The share-code
//                     route below sends it to the worker as `home_org`, so
//                     the worker can say which code opens a mode from that
//                     org's point of view (#345), and returns it to the
//                     client as `home_org` on each answer (for the "has no
//                     modes" note). It is also still in this route's body as
//                     the deprecated `whatsapp_org`, for one release.
//
// The number is returned raw (trimmed, empty → null). Normalising it into
// the `wa.me` digit form is the client lib's job, so the shape check lives
// in one place and is unit-tested there.

export interface ShareConfigResponse {
  whatsapp_number: string | null;
  /**
   * @deprecated Kept for ONE release (#345) so share panels already open in
   * 1.16.x tabs keep their org-mismatch refusal instead of offering a bare
   * `#<slug>` for a partner org's mode. 1.17.0 clients ignore it; remove in
   * the next release.
   */
  whatsapp_org: string | null;
}

export function handleShareConfig(env: Env): Response {
  const body: ShareConfigResponse = {
    whatsapp_number: presentOrNull(env.WHATSAPP_NUMBER),
    whatsapp_org: presentOrNull(env.WHATSAPP_ORG),
  };
  return jsonResponse(body);
}

function presentOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// #345 — authoritative WhatsApp share code for one mode.
//
// The worker (bt-servant-worker#477) answers which `#<code>` opens a mode
// from the gateway org's point of view by running the chat path's own read,
// merge and classifier: bare slug for a home mode, `<orgslug>/<slug>` for a
// partner org's, plus whether it really resolves (cap, cross-org slug
// collisions, skipped orgs, drafts, group-only). The portal no longer
// derives any of that itself.
//
// `org` is the org exactly as `resolveOrg` (worker/config.ts) resolved it
// for the mode read, so the worker reads the same `<org>:modes` key the
// modes page edits (raw for same-org callers, padding and all).
// ---------------------------------------------------------------------------

// The response type and the answer parser are shared with the client
// (src/types/mode-share-code.ts, src/lib/mode-share-code-wire.ts). `reason` is passed through as any string:
// the worker contract is additive, and the panel reads an unknown reason
// as "does not open this mode".

/** How long the BFF waits for the worker's share-code answer, body included. */
export const SHARE_CODE_UPSTREAM_TIMEOUT_MS = 10_000;

/** `/api/config/modes/{name}/share-code`; group 1 is the encoded mode name. */
export const SHARE_CODE_PATH = /^\/api\/config\/modes\/([^/]+)\/share-code$/;

/**
 * An error body of the share-code route: a human `error` plus the
 * machine-readable `code` the client switches on.
 */
export function shareCodeError(
  message: string,
  code: ShareCodeErrorCode,
  status: number
): Response {
  return jsonResponse({ error: message, code }, status);
}

// One source per shape the share-code route answers with more than once.

/** WHATSAPP_ORG can't be used: the 200 `unconfigured` answer. */
export function unconfigured(): Response {
  return jsonResponse({
    capability: "unconfigured",
  } satisfies ModeShareCodeResponse);
}

/**
 * 400 code `invalid_mode_name`: a name the worker rejects, or a path
 * segment the BFF couldn't decode. The coded counterpart of the generic
 * routes' `invalidModeNameResponse`.
 */
export function shareCodeInvalidModeName(): Response {
  return shareCodeError(
    "Invalid mode name",
    SHARE_CODE_ERRORS.invalidModeName,
    400
  );
}

/** Who is asking, for what the answer may name. */
export interface ShareCodeCaller {
  isSuperAdmin: boolean;
}

/**
 * The worker's body: parsed JSON; fully received but not JSON (or empty);
 * cut off by an abort (timeout or client gone); or a read that failed
 * otherwise (a dropped connection).
 */
type BodyRead =
  | { kind: "json"; body: unknown }
  | { kind: "not-json" }
  | { kind: "aborted" }
  | { kind: "failed" };

async function readBody(res: Response, signal: AbortSignal): Promise<BodyRead> {
  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    // The timeout covers the body too: a stalled body is a 504. Any other
    // failed read is a transient 502, never a "not JSON" body (which, on a
    // 404, would read as an older worker).
    const name = error instanceof Error ? error.name : "";
    if (signal.aborted || name === "AbortError" || name === "TimeoutError") {
      return { kind: "aborted" };
    }
    return { kind: "failed" };
  }
  try {
    return { kind: "json", body: JSON.parse(text) as unknown };
  } catch {
    return { kind: "not-json" };
  }
}

export async function handleModeShareCode(
  env: Env,
  org: string,
  modeName: string,
  opts: {
    /** The session asking; decides whether `resolved_org` may be named. */
    caller: ShareCodeCaller;
    /**
     * The browser request's signal. Under the `enable_request_signal`
     * compatibility flag it aborts when the client goes away (the panel
     * closed), and the upstream call is cancelled with it.
     */
    signal?: AbortSignal;
    /** Overridable for tests. */
    timeoutMs?: number;
  }
): Promise<Response> {
  // Used EXACTLY as set: the worker's home check is an exact KV key match
  // (`<org>:modes`), so trimming here could ask from a different org than
  // the gateway sends. Only an unset value is caught here; the worker
  // judges the rest, and its 400s name the field they rejected (mapped
  // below).
  const homeOrg = env.WHATSAPP_ORG;
  if (homeOrg === undefined || !isUsableHomeOrg(homeOrg)) {
    return unconfigured();
  }
  const path =
    `/api/v1/admin/orgs/${encodeURIComponent(org)}` +
    `/modes/${encodeURIComponent(modeName)}/share-code` +
    `?home_org=${encodeURIComponent(homeOrg)}`;
  // Bounded by the timeout, and cancelled when the browser goes away
  // (`request.signal`, live under the `enable_request_signal`
  // compatibility flag in wrangler.jsonc).
  const timeout = AbortSignal.timeout(
    opts.timeoutMs ?? SHARE_CODE_UPSTREAM_TIMEOUT_MS
  );
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;
  // The browser went away: nobody reads this answer, so no body.
  const clientGone = () => new Response(null, { status: 499 });
  const timedOut = () =>
    shareCodeError("Engine timeout", SHARE_CODE_ERRORS.engineTimeout, 504);
  const engineError = (message = "Engine error") =>
    shareCodeError(message, SHARE_CODE_ERRORS.engineError, 502);
  let res: Response;
  try {
    // engineFetch sets the engine key (the admin key, with its
    // ENGINE_API_KEY fallback) and logs an engine 401/403 as
    // engine_auth_error; the response comes back unchanged, so the
    // `engine_auth` mapping below still applies.
    res = await engineFetch(env, path, { signal });
  } catch {
    // A worker that doesn't answer in time is a 504: the client's
    // transient "server" state, with Try again.
    if (timeout.aborted) return timedOut();
    if (opts.signal?.aborted) return clientGone();
    return engineError("Engine unreachable");
  }
  const read = await readBody(res, signal);
  if (read.kind === "aborted") {
    return !timeout.aborted && opts.signal?.aborted ? clientGone() : timedOut();
  }
  if (read.kind === "failed") return engineError();
  const body =
    read.kind === "json" && read.body !== null && typeof read.body === "object"
      ? (read.body as Record<string, unknown>)
      : null;
  const error = typeof body?.error === "string" ? body.error : null;

  if (res.status === 404) {
    if (error === SHARE_CODE_ERRORS.modeNotFound) {
      return shareCodeError(
        "Mode not found",
        SHARE_CODE_ERRORS.modeNotFound,
        404
      );
    }
    // A JSON 404 with an `error` means the route exists and something
    // else went wrong: a generic error, with Try again.
    if (error !== null) return engineError();
    // Only a fully received non-JSON or empty 404 is a worker without the
    // route (Hono's plain "404 Not Found"): one "needs a newer BT
    // Servant" state for every mode. The deploy order puts the worker
    // with #477 in production first, so there is no bare-slug fallback.
    // A JSON 404 that isn't an error object (`null`, a string, an array)
    // came from something that speaks JSON: transient, below.
    if (read.kind === "not-json") {
      return shareCodeError(
        "Share codes need a newer BT Servant",
        SHARE_CODE_ERRORS.shareCodeUnsupported,
        404
      );
    }
    return engineError();
  }
  // Every 503 (`detail`: list_failed, read_failed, listing_lag) is
  // transient on the worker's side; the panel offers a retry.
  if (res.status === 503) {
    return shareCodeError(
      "Modes unavailable",
      SHARE_CODE_ERRORS.modesUnavailable,
      503
    );
  }
  // Permanent: the org's stored modes record is unreadable (not JSON, or
  // not a modes record). Passed through so the panel can say so instead of
  // offering a retry.
  if (res.status === 500 && error === SHARE_CODE_ERRORS.corruptModesRecord) {
    return shareCodeError(
      "Corrupt modes record",
      SHARE_CODE_ERRORS.corruptModesRecord,
      500
    );
  }
  // The worker refused the BFF's own credentials: a configuration
  // problem, not the caller's session, so not a 401 / 403 to the browser.
  if (res.status === 401 || res.status === 403) {
    return shareCodeError(
      "BT Servant refused the portal's credentials",
      SHARE_CODE_ERRORS.engineAuth,
      502
    );
  }
  if (res.status === 400) {
    // The worker names the field it rejected (#477). `home_org` is
    // WHATSAPP_ORG (`invalid_org` or `home_org_required`), so it is this
    // environment's configuration, not the mode's org.
    if (body?.field === "home_org") return unconfigured();
    if (error === SHARE_CODE_ERRORS.invalidOrg) return invalidOrg();
    if (error === SHARE_CODE_ERRORS.invalidModeName) {
      return shareCodeInvalidModeName();
    }
    return shareCodeError("Bad request", SHARE_CODE_ERRORS.badRequest, 400);
  }
  if (!res.ok) return engineError();

  const answer = parseShareCodeAnswer(body);
  if (answer === null) return engineError("Malformed engine response");
  return jsonResponse({
    capability: "present",
    ...homeOrgFor(homeOrg, org, opts.caller),
    queried_org: org,
    ...withoutForeignOrg(answer, org, opts.caller),
  } satisfies ModeShareCodeResponse);
}

/**
 * `home_org` (WHATSAPP_ORG) names the gateway's org. The same rule as
 * `resolved_org`: a super-admin sees it; anyone else only when it is,
 * exactly, the org this route asked about (their own). Without it the
 * panel's "no modes" note doesn't name the org.
 */
function homeOrgFor(
  homeOrg: string,
  queried: string,
  caller: ShareCodeCaller
): { home_org?: string } {
  return caller.isSuperAdmin || homeOrg === queried
    ? { home_org: homeOrg }
    : {};
}

/**
 * `resolved_org` names the org whose mode a code opens instead. Only a
 * super-admin may see another org's name: other orgs' mode names are not
 * an org admin's to learn. The org this route asked about (`queried`, the
 * exact string sent to the worker; the caller's own org unless they are a
 * super-admin) is always fine to name. Without it the panel says "another
 * org's mode".
 */
function withoutForeignOrg(
  answer: ShareCodeAnswer,
  queried: string,
  caller: ShareCodeCaller
): ShareCodeAnswer {
  if (answer.resolved_org === undefined || caller.isSuperAdmin) return answer;
  // Exact, the same rule the panel's same-org check uses on `queried_org`:
  // the worker's org keys are exact (#247/#253), so " pbt" is not "pbt".
  if (answer.resolved_org === queried) return answer;
  const rest = { ...answer };
  delete rest.resolved_org;
  return rest;
}

/**
 * Whether WHATSAPP_ORG is set at all: not empty or whitespace-only. Every
 * other rule (e.g. the KV key length) is the worker's, which answers 400
 * with `field: "home_org"` (mapped to `unconfigured` above).
 */
export function isUsableHomeOrg(org: string): boolean {
  return org.trim() !== "";
}
