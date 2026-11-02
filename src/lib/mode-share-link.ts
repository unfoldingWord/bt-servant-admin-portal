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
// Scanning it opens WhatsApp on the BT Servant chat with the trigger
// already typed; sending it hits the worker's leading-token classifier,
// which activates and persists the mode for that user. The bare form has
// worked since the hashtag mechanism shipped. The qualified form needs
// worker >= v2.57.0 (worker#437) in the same environment; against an older
// worker a partner org's code answers "unknown mode".
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

export type ModeShareSlugVerdict = "ok" | "slug-invalid" | "slug-reserved";

/**
 * Can this slug be carried by a `#` trigger at all? Independent of the
 * number and of publish state — it is about the mode's identity, so the
 * panel reports it before eligibility (a draft named `default` should hear
 * "rename", not "publish"). A stored slug never contains `/`; the
 * qualified name the portal composes is checked separately
 * (`isQualifiedModeName`).
 */
export function validateModeShareSlug(slug: string): ModeShareSlugVerdict {
  if (!MODE_NAME_PATTERN.test(slug)) return "slug-invalid";
  if (RESERVED_TRIGGERS.has(slug)) return "slug-reserved";
  return "ok";
}

/**
 * How a share code addresses this mode, given the gateway org.
 *
 * - `home`: the mode is in the gateway's org. The trigger is the bare slug.
 * - `partner`: the mode is in another org. The worker resolves a bare
 *   `#<slug>` against the GATEWAY's org, so a bare trigger here would open
 *   the gateway org's mode of the same name, or none. The trigger is
 *   `<orgslug>/<slug>`, the name the worker gives a foreign published mode.
 * - `org-unknown`: either org is unknown, so home vs partner can't be
 *   decided. No trigger is produced at all: guessing "home" would hand a
 *   partner mode a bare trigger. `WHATSAPP_ORG` is set in every wrangler
 *   environment, and the page always knows the mode's org once signed in,
 *   so in practice this is the loading / error window only.
 * - `org-unencodable`: a partner org whose name yields no usable org slug
 *   (no letters or digits, or over 64 characters once slugged). The worker
 *   skips such an org, so there is nothing to link to.
 *
 * Home vs partner is decided by EXACT string equality, like the worker:
 * its chat path reads `${org}:modes` for the request org untrimmed and
 * treats every other `*:modes` key as foreign (`name !== homeKey` in
 * cross-org-modes.ts). `modeOrg` is the org the modes page addresses,
 * which for an org admin is the raw `session.org` the BFF forwards
 * (resolveOrg in worker/config.ts), i.e. the mode's actual key. A legacy
 * whitespace-padded org (#247/#253) is therefore a foreign org to the
 * worker, and gets the qualified trigger here too; `orgSlug` trims, so its
 * slug is unaffected. `whatsappOrg` arrives trimmed from the BFF
 * (`presentOrNull` in worker/share-config.ts).
 */
export type ModeShareTarget =
  | { kind: "home"; name: string }
  | { kind: "partner"; name: string; org: string }
  | { kind: "org-unknown"; missing: "gateway" | "mode" }
  | { kind: "org-unencodable"; org: string };

export function resolveModeShareTarget(
  slug: string,
  modeOrg: string | null | undefined,
  whatsappOrg: string | null | undefined
): ModeShareTarget {
  if (!whatsappOrg?.trim()) return { kind: "org-unknown", missing: "gateway" };
  if (!modeOrg?.trim()) return { kind: "org-unknown", missing: "mode" };
  if (modeOrg === whatsappOrg) return { kind: "home", name: slug };
  const qualifier = orgSlug(modeOrg);
  // The org half alone: the mode half is the slug's own check, reported
  // as such by the caller.
  if (!MODE_NAME_PATTERN.test(qualifier)) {
    return { kind: "org-unencodable", org: modeOrg.trim() };
  }
  return { kind: "partner", name: `${qualifier}/${slug}`, org: modeOrg.trim() };
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
 * Build the share link for `name`, or say why it cannot be built. `name`
 * is either a bare slug (held to `validateModeShareSlug`) or the
 * `<orgslug>/<slug>` a `partner` target composes (held to
 * `isQualifiedModeName`, the worker's `validateModeSelection` rule).
 * Anything else is refused rather than rewritten, because a rewritten name
 * would encode a trigger that targets a different mode. Reserved
 * clear-tokens are refused for a bare name; a qualified name can never be
 * one (the worker checks the whole token against `CLEAR_TOKENS`).
 */
export function buildModeShareLink(
  rawNumber: string | null | undefined,
  name: string
): ModeShareLinkResult {
  if (!rawNumber || rawNumber.trim() === "") {
    return { ok: false, reason: "number-missing" };
  }
  const digits = normalizeWhatsAppNumber(rawNumber);
  if (!digits) return { ok: false, reason: "number-invalid" };
  if (name.includes("/")) {
    if (!isQualifiedModeName(name))
      return { ok: false, reason: "slug-invalid" };
  } else {
    const verdict = validateModeShareSlug(name);
    if (verdict !== "ok") return { ok: false, reason: verdict };
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

/** Why the panel shows no code, or that it shows one. */
export type ModeShareStatus =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unconfigured" }
  | { kind: "number-invalid" }
  | { kind: "slug-invalid" }
  | { kind: "slug-reserved" }
  | { kind: "org-unknown"; missing: "gateway" | "mode" }
  | { kind: "org-unencodable"; org: string }
  | { kind: "group-only" }
  | { kind: "draft" }
  | { kind: "ready"; url: string };

/**
 * The panel's whole input, so the component derives nothing itself.
 * `trigger` is what the card, the QR's label and the copy show: the
 * qualified one for a partner mode, and null whenever the target can't be
 * decided, so no bare `#<slug>` is ever shown for a mode that might be
 * outside the gateway's org. `partnerOrg` is the mode's org when its code
 * is qualified, for the "A mode from <org>" line.
 */
export type ModeSharePanelState = ModeShareStatus & {
  trigger: string | null;
  partnerOrg: string | null;
};

/**
 * Resolve what the panel shows. Order of precedence:
 *
 * 1. query lifecycle (loading, error), then an absent BFF route, which
 *    reads as "not configured" (an older deploy has neither number nor
 *    org to give);
 * 2. the mode's identity: a slug no trigger can carry, then which org
 *    the code addresses (unknown, or a partner org with no usable slug),
 *    then a reserved slug. Publishing fixes none of these, so they come
 *    before any publish advice;
 * 3. eligibility, via `modeShareState`: group-only, then draft;
 * 4. the number: missing or invalid.
 */
export function resolveModeSharePanelState(
  snapshot: ShareConfigSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeOrg: string | null | undefined,
  modeName: string
): ModeSharePanelState {
  const none = { trigger: null, partnerOrg: null };
  if (snapshot.pending) return { kind: "loading", ...none };
  if (snapshot.error) return { kind: "error", ...none };
  if (!snapshot.supported) return { kind: "unconfigured", ...none };
  const slugVerdict = validateModeShareSlug(modeName);
  if (slugVerdict === "slug-invalid") return { kind: "slug-invalid", ...none };
  const target = resolveModeShareTarget(
    modeName,
    modeOrg,
    snapshot.whatsappOrg
  );
  if (target.kind === "org-unknown") {
    return { kind: "org-unknown", missing: target.missing, ...none };
  }
  if (target.kind === "org-unencodable") {
    return { kind: "org-unencodable", org: target.org, ...none };
  }
  const shown = {
    trigger: modeShareTrigger(target.name),
    partnerOrg: target.kind === "partner" ? target.org : null,
  };
  // Policy, not a worker limit for partners: `#pbt/default` is not a clear
  // token, but a mode named after one can't be shared from its home org
  // either, so the panel asks for a rename in every org.
  if (slugVerdict === "slug-reserved")
    return { kind: "slug-reserved", ...shown };
  const eligibility = modeShareState(flags);
  if (eligibility !== "ready") return { kind: eligibility, ...shown };
  const link = buildModeShareLink(snapshot.whatsappNumber, target.name);
  if (link.ok) return { kind: "ready", url: link.url, ...shown };
  switch (link.reason) {
    case "number-missing":
      return { kind: "unconfigured", ...shown };
    case "number-invalid":
      return { kind: "number-invalid", ...shown };
    // Ruled out above (the slug checks, and the target's org-half check);
    // kept so the switch stays exhaustive.
    case "slug-invalid":
    case "slug-reserved":
      return { kind: link.reason, ...none };
  }
}
