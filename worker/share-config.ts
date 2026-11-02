import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import {
  parseShareCodeAnswer,
  SHARE_CODE_ERRORS,
  type ModeShareCodeResponse,
} from "../src/types/mode-share-code";

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

/** How long the BFF waits for the worker's share-code answer. */
export const SHARE_CODE_UPSTREAM_TIMEOUT_MS = 10_000;

export async function handleModeShareCode(
  env: Env,
  org: string,
  modeName: string,
  opts: {
    /** The client's request signal: a closed panel cancels the upstream call. */
    signal?: AbortSignal;
    /** Overridable for tests. */
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  // Used EXACTLY as set: the worker's home check is an exact KV key match
  // (`<org>:modes`), so trimming here could ask from a different org than
  // the gateway sends. A value the worker would reject as `invalid_org`
  // (empty, or a modes key over the KV limit) is caught here instead, so a
  // worker `invalid_org` can only be about the MODE's org.
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
  const timeout = AbortSignal.timeout(
    opts.timeoutMs ?? SHARE_CODE_UPSTREAM_TIMEOUT_MS
  );
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ENGINE_API_KEY}` },
      signal,
    });
  } catch {
    // A worker that doesn't answer in time is a 504: the client's
    // transient "server" state, with Try again.
    if (timeout.aborted) {
      return errorResponse(SHARE_CODE_ERRORS.bffTimeout, 504);
    }
    return errorResponse("Engine unreachable", 502);
  }
  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const error = typeof body?.error === "string" ? body.error : null;

  if (res.status === 404) {
    if (error === SHARE_CODE_ERRORS.modeNotFound) {
      return errorResponse(SHARE_CODE_ERRORS.modeNotFound, 404);
    }
    // Any other JSON error is a real 404 from a worker that HAS the route
    // (or something in front of it): never read it as "older worker", which
    // would fall back to a bare-slug link.
    if (error !== null) return errorResponse("Engine error", 502);
    // A worker without the route answers Hono's default plain-text
    // "404 Not Found" (bt-servant-worker defines no notFound handler).
    return jsonResponse({
      capability: "absent",
      home: org === homeOrg,
    } satisfies ModeShareCodeResponse);
  }
  // Every 503 (`detail`: list_failed, read_failed, listing_lag) is
  // transient on the worker's side; the panel offers a retry.
  if (res.status === 503) return errorResponse("modes_unavailable", 503);
  // Permanent: the org's stored modes record isn't valid JSON. Passed
  // through as itself so the panel can say so instead of offering a retry.
  if (res.status === 500 && error === SHARE_CODE_ERRORS.corruptModesRecord) {
    return errorResponse(SHARE_CODE_ERRORS.corruptModesRecord, 500);
  }
  if (res.status === 400) return errorResponse(error ?? "bad_request", 400);
  if (!res.ok) return errorResponse("Engine error", 502);

  const answer = parseShareCodeAnswer(body);
  if (answer === null) return errorResponse("Malformed engine response", 502);
  return jsonResponse({
    capability: "present",
    home_org: homeOrg,
    ...answer,
  } satisfies ModeShareCodeResponse);
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
