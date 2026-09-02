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

import { sanitizeFilenamePart } from "@/lib/mode-export";

export const WA_ME_ORIGIN = "https://wa.me";

// E.164 caps a number at 15 digits and forbids a leading zero. The lower
// bound is a typo guard — no live country-code + subscriber number is
// shorter — not a formal E.164 minimum.
const E164_DIGITS = /^[1-9][0-9]{6,14}$/;

// The worker's `MODE_NAME_PATTERN` (bt-servant-worker
// src/types/prompt-overrides.ts): lowercase alphanumerics and inner
// hyphens, 1–64 chars, no underscores. Stricter than the portal's
// `slugifyModeName` (which keeps `_`), and the one the worker enforces on
// every mode route — so it is the one a trigger has to satisfy.
const MODE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Reserved by the worker's classifier as "clear the active mode"
// (`CLEAR_TOKENS`, src/services/classifier/index.ts). Checked BEFORE mode
// matching there, so `#default` can never reach a mode named `default`;
// a QR for one would silently deactivate whatever mode the user had.
const RESERVED_TRIGGERS: ReadonlySet<string> = new Set([
  "default",
  "none",
  "clear",
]);

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

export type ModeShareSlugVerdict = "ok" | "slug-invalid" | "slug-reserved";

/**
 * Can this slug be carried by a `#` trigger at all? Independent of the
 * number and of publish state — it is about the mode's identity, so the
 * panel reports it before eligibility (a draft named `default` should hear
 * "rename", not "publish").
 */
export function validateModeShareSlug(slug: string): ModeShareSlugVerdict {
  if (!MODE_NAME_PATTERN.test(slug)) return "slug-invalid";
  if (RESERVED_TRIGGERS.has(slug)) return "slug-reserved";
  return "ok";
}

export type ModeShareLinkFailure =
  | "number-missing"
  | "number-invalid"
  | "slug-invalid"
  | "slug-reserved";

export type ModeShareLinkResult =
  | { ok: true; url: string; digits: string; trigger: string }
  | { ok: false; reason: ModeShareLinkFailure };

/**
 * Build the share link, or say why it cannot be built. The slug must
 * already match the worker's mode-name pattern: anything else is refused
 * rather than rewritten, because a rewritten slug would encode a trigger
 * that targets a different mode. Reserved clear-tokens are refused too.
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
  const slugVerdict = validateModeShareSlug(slug);
  if (slugVerdict !== "ok") return { ok: false, reason: slugVerdict };
  const trigger = modeShareTrigger(slug);
  // `encodeURIComponent` turns the `#` into `%23`; the slug's own alphabet
  // ([a-z0-9-]) is untouched by it, which is what keeps the link legible.
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
 *   Compared trimmed: legacy stored orgs can carry padding (#247/#253).
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
  const a = modeOrg?.trim();
  const b = whatsappOrg?.trim();
  if (a && b && a !== b) return "org-mismatch";
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
  return `${sanitizeFilenamePart(org)}-mode-${sanitizeFilenamePart(slug)}-whatsapp-qr.${ext}`;
}

/**
 * Whether the share dialog is open. Derived from identity, not a lagged
 * boolean: `shareFor` is the mode the QR button was pressed for, so any
 * selection change (a switch, a cleared stale mode, a rights drop, an org
 * switch) closes the dialog in the SAME render — never a frame of mode B
 * under mode A's flags, and never an unmount while open.
 */
export function isModeShareOpen(
  shareFor: string | null,
  selectedMode: string | null
): boolean {
  return shareFor !== null && shareFor === selectedMode;
}

// ---------------------------------------------------------------------------
// Panel state machine (#311). Pure so every branch is unit-testable; the
// component only renders what this returns.
// ---------------------------------------------------------------------------

/** What the share-config query currently knows. */
export interface ShareConfigSnapshot {
  pending: boolean;
  error: boolean;
  /** `false` when the BFF route is absent (older deploy). */
  supported: boolean;
  whatsappNumber: string | null;
  whatsappOrg: string | null;
}

export type ModeSharePanelState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unconfigured" }
  | { kind: "number-invalid" }
  | { kind: "slug-invalid" }
  | { kind: "slug-reserved" }
  | { kind: "org-mismatch"; whatsappOrg: string }
  | { kind: "group-only" }
  | { kind: "draft" }
  | { kind: "ready"; url: string; orgUnverified: boolean };

/**
 * Resolve what the panel shows. Order of precedence:
 *
 * 1. query lifecycle (loading, error);
 * 2. the mode's identity — a slug the worker's trigger cannot carry
 *    (non-canonical or reserved). Nothing else can fix that, so it is
 *    named before any publish/org advice;
 * 3. eligibility, via `modeShareState` — org mismatch, then group-only,
 *    then draft (the hardest constraint first, so the copy names the one
 *    thing that has to change);
 * 4. the number — missing or invalid.
 *
 * A missing BFF route (`supported === false`) reads as "not configured":
 * an older portal deploy has no number to give, and that is the truthful
 * operator-facing message. `orgUnverified` is set on a ready result when
 * the gateway org is unknown, so the card can say the org check was
 * skipped rather than silently looking ready.
 */
export function resolveModeSharePanelState(
  snapshot: ShareConfigSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeOrg: string | null | undefined,
  modeName: string
): ModeSharePanelState {
  if (snapshot.pending) return { kind: "loading" };
  if (snapshot.error) return { kind: "error" };
  const slugVerdict = validateModeShareSlug(modeName);
  if (slugVerdict !== "ok") return { kind: slugVerdict };
  const whatsappOrg = snapshot.supported ? snapshot.whatsappOrg : null;
  const whatsappNumber = snapshot.supported ? snapshot.whatsappNumber : null;
  const eligibility = modeShareState(flags, modeOrg, whatsappOrg);
  if (eligibility === "org-mismatch") {
    return { kind: "org-mismatch", whatsappOrg: whatsappOrg ?? "" };
  }
  if (eligibility !== "ready") return { kind: eligibility };
  const link = buildModeShareLink(whatsappNumber, modeName);
  if (link.ok) {
    return { kind: "ready", url: link.url, orgUnverified: !whatsappOrg };
  }
  switch (link.reason) {
    case "number-missing":
      return { kind: "unconfigured" };
    case "number-invalid":
      return { kind: "number-invalid" };
    // Already ruled out above; kept so the switch stays exhaustive.
    case "slug-invalid":
    case "slug-reserved":
      return { kind: slugVerdict === "ok" ? "slug-invalid" : slugVerdict };
  }
}
