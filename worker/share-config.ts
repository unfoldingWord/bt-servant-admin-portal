import type { Env } from "./helpers";
import { jsonResponse } from "./helpers";
import {
  parseShareCodeAnswer,
  SHARE_CODE_ERRORS,
  type ModeShareCodeResponse,
  type ShareCodeAnswer,
  type ShareCodeErrorCode,
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
// (src/types/mode-share-code.ts). `reason` is passed through as any string:
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

/** Who is asking, for what the answer may name. */
export interface ShareCodeCaller {
  org: string;
  isSuperAdmin: boolean;
}

/** The worker's body: parsed JSON, not JSON (or empty), or cut off by an abort. */
type BodyRead =
  | { kind: "json"; body: unknown }
  | { kind: "not-json" }
  | { kind: "aborted" };

async function readBody(res: Response, signal: AbortSignal): Promise<BodyRead> {
  try {
    return { kind: "json", body: await res.json() };
  } catch (error) {
    // The timeout covers the body too: a stalled body is a 504, not a
    // "not JSON" body (which, on a 404, would read as an older worker).
    const name = error instanceof Error ? error.name : "";
    if (signal.aborted || name === "AbortError" || name === "TimeoutError") {
      return { kind: "aborted" };
    }
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
  // the gateway sends. This pre-check is only a cheap guard that skips a
  // round trip for a value that can't work; the worker is authoritative,
  // and its 400s name the field they rejected (mapped below).
  const homeOrg = env.WHATSAPP_ORG;
  if (homeOrg === undefined || !isUsableHomeOrg(homeOrg)) {
    return jsonResponse({
      capability: "unconfigured",
    } satisfies ModeShareCodeResponse);
  }
  const url =
    `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(org)}` +
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
  // The browser went away: nobody reads this answer.
  const clientGone = () =>
    shareCodeError("Client closed request", SHARE_CODE_ERRORS.engineError, 499);
  const timedOut = () =>
    shareCodeError("Engine timeout", SHARE_CODE_ERRORS.engineTimeout, 504);
  const engineError = () =>
    shareCodeError("Engine error", SHARE_CODE_ERRORS.engineError, 502);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ENGINE_API_KEY}` },
      signal,
    });
  } catch {
    // A worker that doesn't answer in time is a 504: the client's
    // transient "server" state, with Try again.
    if (timeout.aborted) return timedOut();
    if (opts.signal?.aborted) return clientGone();
    return shareCodeError(
      "Engine unreachable",
      SHARE_CODE_ERRORS.engineError,
      502
    );
  }
  const read = await readBody(res, signal);
  if (read.kind === "aborted") {
    return !timeout.aborted && opts.signal?.aborted ? clientGone() : timedOut();
  }
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
    // A non-JSON or empty 404 is a worker without the route (Hono's plain
    // "404 Not Found"): one "needs a newer BT Servant" state for every
    // mode. The deploy order puts the worker with #477 in production
    // first, so there is no bare-slug fallback.
    if (read.kind === "not-json" || body === null) {
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
  if (res.status === 400) {
    // The worker names the field it rejected (#477). `home_org` is
    // WHATSAPP_ORG (`invalid_org` or `home_org_required`), so it is this
    // environment's configuration, not the mode's org.
    if (body?.field === "home_org") {
      return jsonResponse({
        capability: "unconfigured",
      } satisfies ModeShareCodeResponse);
    }
    if (error === SHARE_CODE_ERRORS.invalidOrg) {
      return shareCodeError("Invalid org", SHARE_CODE_ERRORS.invalidOrg, 400);
    }
    if (error === SHARE_CODE_ERRORS.invalidModeName) {
      return shareCodeError(
        "Invalid mode name",
        SHARE_CODE_ERRORS.invalidModeName,
        400
      );
    }
    return shareCodeError("Bad request", SHARE_CODE_ERRORS.badRequest, 400);
  }
  if (!res.ok) return engineError();

  const answer = parseShareCodeAnswer(body);
  if (answer === null) {
    return shareCodeError(
      "Malformed engine response",
      SHARE_CODE_ERRORS.engineError,
      502
    );
  }
  return jsonResponse({
    capability: "present",
    home_org: homeOrg,
    ...withoutForeignOrg(answer, opts.caller),
  } satisfies ModeShareCodeResponse);
}

/**
 * `resolved_org` names the org whose mode a code opens instead. Only a
 * super-admin, or a caller whose own org it is, may see that name: other
 * orgs' mode names are not theirs to learn. Without it the panel says
 * "another org's mode".
 */
function withoutForeignOrg(
  answer: ShareCodeAnswer,
  caller: ShareCodeCaller
): ShareCodeAnswer {
  if (answer.resolved_org === undefined || caller.isSuperAdmin) return answer;
  // Exact, like the worker's own org keys (#247/#253): " pbt" and "pbt"
  // are different orgs, so a padded foreign org never passes as one's own.
  if (answer.resolved_org === caller.org) return answer;
  const rest = { ...answer };
  delete rest.resolved_org;
  return rest;
}

/** Cloudflare KV's key limit, in bytes; the worker applies it to `<org>:modes`. */
const KV_KEY_MAX_BYTES = 512;

/**
 * Whether WHATSAPP_ORG can name a home org for the worker: not empty or
 * whitespace-only, and its `<org>:modes` key within the KV key limit (the
 * worker's own `invalid_org` rule, bt-servant-worker#477).
 */
export function isUsableHomeOrg(org: string): boolean {
  if (org.trim() === "") return false;
  return new TextEncoder().encode(`${org}:modes`).length <= KV_KEY_MAX_BYTES;
}
