import type { Env } from "./helpers";
import { jsonResponse } from "./helpers";

// #311 — read-only share configuration for the per-mode WhatsApp QR.
//
// Two operator-set vars, both from wrangler.jsonc per environment:
//   WHATSAPP_NUMBER — the BT Servant WhatsApp number (E.164). Empty by
//                     default; the portal renders "not configured" until it
//                     is set. The worker's first-contact message (issue #311
//                     part 2) will read the SAME var name from its
//                     wrangler.toml; when it lands, change both together.
//   WHATSAPP_ORG    — the org the WhatsApp gateway is pinned to
//                     (`ENGINE_ORG` in the gateway's wrangler.toml). Lets
//                     the portal say when a mode is unreachable from
//                     WhatsApp because it belongs to another org.
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
