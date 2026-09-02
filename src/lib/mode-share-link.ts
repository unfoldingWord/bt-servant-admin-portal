// Pure helpers for the per-mode WhatsApp share link and QR (#311).
//
// The link is a `wa.me` deep link with the mode's `#<slug>` trigger
// pre-filled as the first message:
//
//   https://wa.me/<digits>?text=%23<slug>
//
// Scanning it opens WhatsApp on the BT Servant chat with `#<slug>` already
// typed; sending it hits the worker's leading-token classifier, which
// activates and persists the mode for that user. No gateway or worker
// change is needed for the link itself — the trigger has existed since the
// hashtag mechanism shipped.
//
// Both inputs are treated as untrusted: the number is an operator-set env
// var (typo-prone), the slug is user-authored config. Nothing reaches the
// URL without passing the shape check.

import { slugifyModeName } from "@/lib/mode-slug";

export const WA_ME_ORIGIN = "https://wa.me";

// E.164 caps a number at 15 digits and forbids a leading zero. The lower
// bound is a typo guard — no live country-code + subscriber number is
// shorter — not a formal E.164 minimum.
const E164_DIGITS = /^[1-9][0-9]{6,14}$/;

/**
 * Reduce an operator-entered WhatsApp number to the digit string `wa.me`
 * expects. Accepts the `+`, spaces, hyphens, dots, and parentheses people
 * paste from a contact card; returns `null` when what is left is not a
 * plausible E.164 number.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const digits = raw
    .trim()
    .replace(/^\+/, "")
    .replace(/[\s().-]/g, "");
  return E164_DIGITS.test(digits) ? digits : null;
}

/** The message the QR pre-fills: the worker's mode trigger for `slug`. */
export function modeShareTrigger(slug: string): string {
  return `#${slug}`;
}

export type ModeShareLinkResult =
  | { ok: true; url: string; digits: string; trigger: string }
  | { ok: false; reason: "number-missing" | "number-invalid" | "slug-invalid" };

/**
 * Build the share link, or say why it cannot be built. The slug must
 * already be canonical (what `slugifyModeName` would produce): anything
 * else is refused rather than silently rewritten, because a rewritten slug
 * would encode a trigger that targets a different mode.
 */
export function buildModeShareLink(
  rawNumber: string | null | undefined,
  slug: string
): ModeShareLinkResult {
  if (!rawNumber || rawNumber.trim() === "") {
    return { ok: false, reason: "number-missing" };
  }
  const digits = normalizeWhatsAppNumber(rawNumber);
  if (!digits) return { ok: false, reason: "number-invalid" };
  if (!slug || slugifyModeName(slug) !== slug) {
    return { ok: false, reason: "slug-invalid" };
  }
  const trigger = modeShareTrigger(slug);
  // `encodeURIComponent` turns the `#` into `%23`; the slug's own alphabet
  // ([a-z0-9-_]) is untouched by it, which is what keeps the link legible.
  const url = `${WA_ME_ORIGIN}/${digits}?text=${encodeURIComponent(trigger)}`;
  return { ok: true, url, digits, trigger };
}

export type ModeShareState = "ready" | "org-mismatch" | "group-only" | "draft";

/**
 * Whether a scanned QR would actually reach this mode. Checked hardest
 * constraint first so the copy names the thing that must change:
 *
 * - `org-mismatch`: the WhatsApp gateway is pinned to one org
 *   (`ENGINE_ORG` in the gateway's wrangler.toml). A mode under any other
 *   org is unreachable from WhatsApp no matter what else is toggled.
 *   Skipped when either org is unknown — an unset var must not block.
 * - `group-only`: `requires_group` modes are hidden from WhatsApp DMs by
 *   design (#209 / worker#270).
 * - `draft`: the worker masks unpublished modes for non-admin callers, so
 *   a scanned draft answers "unknown mode".
 */
export function modeShareState(
  flags: { published?: boolean; requires_group?: boolean },
  modeOrg: string | null | undefined,
  whatsappOrg: string | null | undefined
): ModeShareState {
  if (modeOrg && whatsappOrg && modeOrg !== whatsappOrg) return "org-mismatch";
  if (flags.requires_group === true) return "group-only";
  if (flags.published !== true) return "draft";
  return "ready";
}

/** Download filename for the QR, mirroring the export naming (#187). */
export function buildModeShareFilename(
  org: string,
  slug: string,
  ext: "svg" | "png"
): string {
  return `${sanitize(org)}-mode-${sanitize(slug)}-whatsapp-qr.${ext}`;
}

function sanitize(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}
