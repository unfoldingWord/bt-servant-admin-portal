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
//                     the org every WhatsApp request carries. Server-side
//                     only: the share-code route below sends it to the
//                     worker as `home_org`, so the worker can say which code
//                     opens a mode from that org's point of view (#345). The
//                     client never needs it.
//
// The number is returned raw (trimmed, empty → null). Normalising it into
// the `wa.me` digit form is the client lib's job, so the shape check lives
// in one place and is unit-tested there.

export interface ShareConfigResponse {
  whatsapp_number: string | null;
}

export function handleShareConfig(env: Env): Response {
  const body: ShareConfigResponse = {
    whatsapp_number: presentOrNull(env.WHATSAPP_NUMBER),
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

export async function handleModeShareCode(
  env: Env,
  org: string,
  modeName: string
): Promise<Response> {
  // Used EXACTLY as set: the worker's home check is an exact KV key match
  // (`<org>:modes`), so trimming here could ask from a different org than
  // the gateway sends. Only an empty or whitespace-only value counts as
  // unset.
  const homeOrg = env.WHATSAPP_ORG;
  if (homeOrg === undefined || homeOrg.trim() === "") {
    return jsonResponse({
      capability: "unconfigured",
    } satisfies ModeShareCodeResponse);
  }
  const url =
    `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(org)}` +
    `/modes/${encodeURIComponent(modeName)}/share-code` +
    `?home_org=${encodeURIComponent(homeOrg)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.ENGINE_API_KEY}` },
    });
  } catch {
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
