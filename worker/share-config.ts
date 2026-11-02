import type { Env } from "./helpers";
import { errorResponse, jsonResponse } from "./helpers";

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
//                     org's point of view (#345).
//
// Returned raw (trimmed, empty → null). Normalising the number into the
// `wa.me` digit form is the client lib's job, so the shape check lives in
// one place and is unit-tested there.

export interface ShareConfigResponse {
  whatsapp_number: string | null;
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

// The worker's reasons today: not_found, draft, requires_group, reserved,
// collision, capped, org_skipped, ambiguous (and possibly a retryable
// `pending`). Passed through as any string: the contract is additive, and
// the panel treats a reason it does not know as "does not open this mode".
export type ShareCodeReason = string;

export type ModeShareCodeResponse =
  // The worker predates the share-code route (a 404 without its
  // `mode_not_found` body). `home` says whether this mode's org is the
  // gateway org by the worker's own exact-key rule, so the panel can keep
  // sharing home modes by their bare slug on an older worker.
  | { capability: "absent"; home: boolean }
  // WHATSAPP_ORG is unset: there is no home org to ask from.
  | { capability: "unconfigured" }
  // WHATSAPP_ORG is set, but the worker has no modes key for that org
  // (400 `unknown_home_org`): a config problem, not an old worker.
  | { capability: "unknown-home-org"; home_org: string }
  | {
      capability: "present";
      code: string | null;
      resolves: boolean;
      reason?: ShareCodeReason;
      resolved_org?: string;
    };

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
    if (error === "unknown_home_org") {
      return jsonResponse({
        capability: "unknown-home-org",
        home_org: homeOrg,
      } satisfies ModeShareCodeResponse);
    }
    return errorResponse(error ?? "bad_request", 400);
  }
  if (!res.ok) return errorResponse("Engine error", 502);

  const parsed = parseShareCodeAnswer(body);
  if (parsed === null) return errorResponse("Malformed engine response", 502);
  return jsonResponse(parsed);
}

/** Shape-check the worker's 200 so a malformed answer never reaches a QR. */
function parseShareCodeAnswer(
  body: Record<string, unknown> | null
): ModeShareCodeResponse | null {
  if (body === null) return null;
  const { code, resolves, reason, resolved_org } = body;
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
  };
}
