// Pure helpers for the per-mode WhatsApp share link and QR (#311).
//
// The link is a `wa.me` deep link with the mode's `#<slug>` trigger
// pre-filled as the first message:
//
//   https://wa.me/<digits>?text=%23<slug>
//
// A mode from another org than the WhatsApp gateway's (a partner org) is
// shared as `#<orgslug>/<slug>` instead (#345, worker#437):
//
//   https://wa.me/<digits>?text=%23<orgslug>%2F<slug>
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

/**
 * The message the QR pre-fills: the worker's mode trigger for `name`, which
 * is either a bare slug or an org-qualified `<orgslug>/<slug>`.
 */
export function modeShareTrigger(name: string): string {
  return `#${name}`;
}

/**
 * The worker's org slug rule, character for character (`orgSlug` in
 * bt-servant-worker src/utils/cross-org-modes.ts): trim, lowercase, turn
 * every run outside `[a-z0-9]` into one `-`, strip edge hyphens.
 * `Test Organization` → `test-organization`, `PBT` → `pbt`. Returns `''`
 * for a blank or punctuation-only name; the worker skips such an org, so
 * the panel must refuse rather than emit `#/<slug>`. Kept in step by a
 * parity test that reuses the worker's own examples.
 */
export function orgSlug(org: string): string {
  return org
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Whether `name` is a well-formed org-qualified mode selection, by the
 * qualified branch of the worker's `validateModeSelection`
 * (src/types/prompt-overrides.ts): exactly one `/`, and both halves match
 * `MODE_NAME_PATTERN`. This checks the trigger the portal COMPOSES; a
 * mode's stored slug is still held to `validateModeShareSlug`, which never
 * accepts `/`.
 */
export function isQualifiedModeName(name: string): boolean {
  const parts = name.split("/");
  if (parts.length !== 2) return false;
  const [org, mode] = parts as [string, string];
  return MODE_NAME_PATTERN.test(org) && MODE_NAME_PATTERN.test(mode);
}

/**
 * Who a share code for this mode is addressed as, given the gateway org.
 *
 * - `home`: the mode is in the gateway's org (or either org is unknown, so
 *   nothing can be compared). The trigger is the bare slug.
 * - `partner`: the mode is in another org. The worker resolves a bare
 *   `#<slug>` against the GATEWAY's org, so a bare trigger here would open
 *   the gateway org's mode of the same name, or none. The trigger is
 *   `<orgslug>/<slug>`, the name the worker gives a foreign published mode.
 * - `org-unencodable`: another org whose name yields no usable org slug
 *   (no letters or digits, or longer than 64 once slugged). Refused.
 *
 * Orgs are compared trimmed but case-sensitively: the worker's home check
 * is an exact KV key match, so `unfoldingword` vs `unfoldingWord` is a
 * foreign org to it. Legacy stored orgs can carry padding (#247/#253).
 * The home org is the gateway's (`WHATSAPP_ORG`), never the admin's
 * context org: a WhatsApp user's request always carries the gateway org.
 */
export type ModeShareTarget =
  | { kind: "home"; name: string }
  | { kind: "partner"; name: string; org: string }
  | { kind: "org-unencodable"; org: string };

export function resolveModeShareTarget(
  slug: string,
  modeOrg: string | null | undefined,
  whatsappOrg: string | null | undefined
): ModeShareTarget {
  const a = modeOrg?.trim();
  const b = whatsappOrg?.trim();
  if (!a || !b || a === b) return { kind: "home", name: slug };
  const name = `${orgSlug(a)}/${slug}`;
  if (!isQualifiedModeName(name)) return { kind: "org-unencodable", org: a };
  return { kind: "partner", name, org: a };
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
  | "slug-reserved"
  | "org-invalid";

export type ModeShareLinkResult =
  | { ok: true; url: string; digits: string; trigger: string }
  | { ok: false; reason: ModeShareLinkFailure };

/**
 * Build the share link, or say why it cannot be built. The slug must
 * already match the worker's mode-name pattern: anything else is refused
 * rather than rewritten, because a rewritten slug would encode a trigger
 * that targets a different mode. Reserved clear-tokens are refused too.
 *
 * `orgQualifier`, when given, is the partner org's slug (see `orgSlug`):
 * the trigger becomes `#<orgQualifier>/<slug>`. The composed name is
 * checked on its own (`isQualifiedModeName`); an empty or malformed
 * qualifier is refused as `org-invalid`, never emitted as `#/<slug>`.
 */
export function buildModeShareLink(
  rawNumber: string | null | undefined,
  slug: string,
  orgQualifier?: string | null
): ModeShareLinkResult {
  if (!rawNumber || rawNumber.trim() === "") {
    return { ok: false, reason: "number-missing" };
  }
  const digits = normalizeWhatsAppNumber(rawNumber);
  if (!digits) return { ok: false, reason: "number-invalid" };
  const slugVerdict = validateModeShareSlug(slug);
  if (slugVerdict !== "ok") return { ok: false, reason: slugVerdict };
  let name = slug;
  if (orgQualifier !== undefined && orgQualifier !== null) {
    name = `${orgQualifier}/${slug}`;
    if (!isQualifiedModeName(name)) return { ok: false, reason: "org-invalid" };
  }
  const trigger = modeShareTrigger(name);
  // `encodeURIComponent` turns the `#` into `%23` and a qualifier's `/`
  // into `%2F` (the worker's own welcome link does the same); the name's
  // [a-z0-9-] alphabet is untouched, which is what keeps the link legible.
  const url = `${WA_ME_ORIGIN}/${digits}?text=${encodeURIComponent(trigger)}`;
  return { ok: true, url, digits, trigger };
}

export type ModeShareState = "ready" | "group-only" | "draft";

/**
 * Whether a scanned QR would actually reach this mode. Checked hardest
 * constraint first so the copy names the thing that must change. The org
 * is not a constraint here any more: since worker#437 a partner org's
 * published mode is reachable through its qualified trigger (see
 * `resolveModeShareTarget`). Both rules below apply to partner modes too.
 *
 * - `group-only`: `requires_group` modes are hidden from WhatsApp DMs by
 *   design (#209 / worker#270).
 * - `draft`: the worker masks unpublished modes for non-admin callers, and
 *   drops another org's drafts before the chat path sees them, so a
 *   scanned draft answers "unknown mode".
 */
export function modeShareState(flags: {
  published?: boolean;
  requires_group?: boolean;
}): ModeShareState {
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
  | { kind: "org-unencodable"; org: string }
  | { kind: "group-only" }
  | { kind: "draft" }
  | {
      kind: "ready";
      url: string;
      /** What the link pre-fills, e.g. `#fia` or `#pbt/obt-coach`. */
      trigger: string;
      /** The mode's org when it is a partner org (qualified trigger), else null. */
      partnerOrg: string | null;
      orgUnverified: boolean;
    };

/**
 * Resolve what the panel shows. Order of precedence:
 *
 * 1. query lifecycle (loading, error);
 * 2. the mode's identity — a slug the worker's trigger cannot carry
 *    (non-canonical or reserved), then a partner org whose name cannot be
 *    slugged. Publishing fixes neither, so they are named before any
 *    publish advice;
 * 3. eligibility, via `modeShareState` — group-only, then draft (the
 *    hardest constraint first, so the copy names the one thing that has
 *    to change);
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
  const target = resolveModeShareTarget(modeName, modeOrg, whatsappOrg);
  if (target.kind === "org-unencodable") {
    return { kind: "org-unencodable", org: target.org };
  }
  const eligibility = modeShareState(flags);
  if (eligibility !== "ready") return { kind: eligibility };
  const partner = target.kind === "partner";
  const link = buildModeShareLink(
    whatsappNumber,
    modeName,
    partner ? orgSlug(target.org) : null
  );
  if (link.ok) {
    return {
      kind: "ready",
      url: link.url,
      trigger: link.trigger,
      partnerOrg: partner ? target.org : null,
      orgUnverified: !whatsappOrg?.trim(),
    };
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
    case "org-invalid":
      return { kind: "org-unencodable", org: modeOrg?.trim() ?? "" };
  }
}
