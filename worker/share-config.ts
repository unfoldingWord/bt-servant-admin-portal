import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";
import type { ModeShareCodeResponse } from "../src/types/mode-share-code";

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

// The response type is shared with the client (src/types/mode-share-code.ts).
// `reason` is passed through as any string: the worker contract is
// additive, and the panel reads an unknown reason as "does not open this
// mode".

export async function handleModeShareCode(
  env: Env,
  org: string,
  modeName: string
): Promise<Response> {
  const homeOrg = presentOrNull(env.WHATSAPP_ORG);
  if (homeOrg === null) {
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
    if (error === "mode_not_found") return errorResponse("mode_not_found", 404);
    return jsonResponse({
      capability: "absent",
      home: org === homeOrg,
    } satisfies ModeShareCodeResponse);
  }
  if (res.status === 503) return errorResponse("modes_unavailable", 503);
  if (res.status === 400) {
    // Pre-final #477 builds answered this; the final contract reports it
    // as `home_has_modes: false` on the 200 instead. Still tolerated.
    if (error === "unknown_home_org") {
      return jsonResponse({
        capability: "unknown-home-org",
        home_org: homeOrg,
      } satisfies ModeShareCodeResponse);
    }
    return errorResponse(error ?? "bad_request", 400);
  }
  if (!res.ok) return errorResponse("Engine error", 502);

  const parsed = parseShareCodeAnswer(body, homeOrg);
  if (parsed === null) return errorResponse("Malformed engine response", 502);
  return jsonResponse(parsed);
}

/** Shape-check the worker's 200 so a malformed answer never reaches a QR. */
function parseShareCodeAnswer(
  body: Record<string, unknown> | null,
  homeOrg: string
): ModeShareCodeResponse | null {
  if (body === null) return null;
  const { code, resolves, reason, resolved_org, home_has_modes } = body;
  if (code !== null && typeof code !== "string") return null;
  if (typeof resolves !== "boolean") return null;
  if (reason !== undefined && typeof reason !== "string") return null;
  if (resolved_org !== undefined && typeof resolved_org !== "string") {
    return null;
  }
  return {
    capability: "present",
    code,
    resolves,
    ...(reason !== undefined ? { reason } : {}),
    ...(resolved_org !== undefined ? { resolved_org } : {}),
    // Additive in #477: false when the gateway org has no modes key (the
    // chat path then treats home as empty). Tolerated when absent or not a
    // boolean, since it only drives a warning.
    ...(typeof home_has_modes === "boolean" ? { home_has_modes } : {}),
    home_org: homeOrg,
  };
}
