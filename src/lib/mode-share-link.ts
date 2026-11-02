// Pure helpers for the per-mode WhatsApp share link and QR (#311).
//
// The link is a `wa.me` deep link with the mode's `#<slug>` trigger
// pre-filled as the first message:
//
//   https://wa.me/<digits>?text=%23<slug>
//
// A mode from another org than the WhatsApp gateway's (a partner org) is
// shared as `#<orgslug>/<slug>` instead (#345):
//
//   https://wa.me/<digits>?text=%23<orgslug>%2F<slug>
//
// Scanning it opens WhatsApp on the BT Servant chat with the trigger
// already typed; sending it hits the worker's leading-token classifier,
// which activates and persists the mode for that user.
//
// Which code opens a mode is the WORKER's answer, not the portal's: its
// share-code route (bt-servant-worker#477) runs the chat path's own read,
// merge and classifier and says whether `#<code>` really opens this mode
// (cross-org slug collisions, the per-turn org cap, skipped orgs, the
// exact-key home rule). The portal builds a link only from a code the
// worker says resolves. On a worker without that route, only a home-org
// mode is shared, by its bare slug, which has worked since the hashtag
// mechanism shipped.
//
// Both inputs are treated as untrusted: the number is an operator-set env
// var (typo-prone), the slug is user-authored config. Nothing reaches the
// URL without passing the shape check.

import { sanitizeFilenamePart } from "@/lib/mode-export";
import type {
  ModeShareCode,
  ShareCodeFailure,
} from "@/lib/mode-share-code-api";

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

export type ModeShareSlugVerdict = "ok" | "slug-invalid" | "slug-reserved";

/**
 * Can this slug be carried by a `#` trigger at all? Independent of the
 * number and of publish state — it is about the mode's identity, so the
 * panel reports it before anything else (a draft named `default` should
 * hear "rename", not "publish"). A stored slug never contains `/`.
 */
export function validateModeShareSlug(slug: string): ModeShareSlugVerdict {
  if (!MODE_NAME_PATTERN.test(slug)) return "slug-invalid";
  if (RESERVED_TRIGGERS.has(slug)) return "slug-reserved";
  return "ok";
}

// Upper bound on a worker code put in a link. Two 64-char halves and the
// `/` are 129; the worker does not cap the org half, so this is a sanity
// bound that keeps the URL and its QR scannable, not a contract.
const MAX_SHARE_CODE_LENGTH = 200;
const SHARE_CODE_SHAPE = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;

/**
 * Whether a code the worker returned can be carried in a `wa.me` link as
 * is: lowercase alphanumerics and hyphens, at most one `/`, of a sane
 * length. Deliberately looser than the worker's own name rules — when the
 * worker says a code resolves, it is the authority; this only guards the
 * URL.
 */
export function isUrlSafeShareCode(code: string): boolean {
  return code.length <= MAX_SHARE_CODE_LENGTH && SHARE_CODE_SHAPE.test(code);
}

export type ModeShareLinkFailure =
  | "number-missing"
  | "number-invalid"
  | "slug-invalid"
  | "slug-reserved"
  | "code-unencodable";

export type ModeShareLinkResult =
  | { ok: true; url: string; digits: string; trigger: string }
  | { ok: false; reason: ModeShareLinkFailure };

type NumberCheck =
  | { ok: true; digits: string }
  | { ok: false; reason: "number-missing" | "number-invalid" };

function checkNumber(rawNumber: string | null | undefined): NumberCheck {
  if (!rawNumber || rawNumber.trim() === "") {
    return { ok: false, reason: "number-missing" };
  }
  const digits = normalizeWhatsAppNumber(rawNumber);
  return digits
    ? { ok: true, digits }
    : { ok: false, reason: "number-invalid" };
}

function linkFor(digits: string, name: string): ModeShareLinkResult {
  const trigger = modeShareTrigger(name);
  // `encodeURIComponent` turns the `#` into `%23` and a qualifier's `/`
  // into `%2F` (the worker's own welcome link does the same); the code's
  // [a-z0-9-] alphabet is untouched, which is what keeps the link legible.
  const url = `${WA_ME_ORIGIN}/${digits}?text=${encodeURIComponent(trigger)}`;
  return { ok: true, url, digits, trigger };
}

/**
 * Build the share link for a mode's own BARE slug (the home-org fallback
 * on a worker without the share-code route). The slug must already match
 * the worker's mode-name pattern and not be a reserved clear-token:
 * anything else is refused rather than rewritten, because a rewritten
 * slug would encode a trigger that targets a different mode.
 */
export function buildModeShareLink(
  rawNumber: string | null | undefined,
  slug: string
): ModeShareLinkResult {
  const number = checkNumber(rawNumber);
  if (!number.ok) return number;
  const verdict = validateModeShareSlug(slug);
  if (verdict !== "ok") return { ok: false, reason: verdict };
  return linkFor(number.digits, slug);
}

/**
 * Build the share link for a code the WORKER says resolves (bare or
 * `<orgslug>/<slug>`). Trusted as the worker's answer; refused only when it
 * can't be carried in a URL (`isUrlSafeShareCode`).
 */
export function buildShareLinkFromCode(
  rawNumber: string | null | undefined,
  code: string
): ModeShareLinkResult {
  const number = checkNumber(rawNumber);
  if (!number.ok) return number;
  if (!isUrlSafeShareCode(code)) {
    return { ok: false, reason: "code-unencodable" };
  }
  return linkFor(number.digits, code);
}

export type ModeShareState = "ready" | "group-only" | "draft";

/**
 * Whether a scanned QR would reach this mode, from the page's own flags.
 * Used only for a home-org mode on a worker without the share-code route;
 * otherwise the worker's answer decides. Same order as the worker's
 * `staticReason` (bt-servant-worker src/utils/mode-share-code.ts): draft,
 * then group-only.
 *
 * - `draft`: the worker masks unpublished modes for non-admin callers, so
 *   a scanned draft answers "unknown mode".
 * - `group-only`: `requires_group` modes are hidden from WhatsApp DMs by
 *   design (#209 / worker#270).
 */
export function modeShareState(flags: {
  published?: boolean;
  requires_group?: boolean;
}): ModeShareState {
  if (flags.published !== true) return "draft";
  if (flags.requires_group === true) return "group-only";
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
  /** A (re)fetch is in flight, e.g. after Try again. */
  fetching: boolean;
  /** `false` when the BFF route is absent (older deploy). */
  supported: boolean;
  whatsappNumber: string | null;
}

/** What the share-code query currently knows. */
export interface ShareCodeSnapshot {
  pending: boolean;
  /** A (re)fetch is in flight: on reopen after the stale time, or a retry. */
  fetching: boolean;
  /** The query threw (the client maps HTTP outcomes itself; this is a bug or crash). */
  error: boolean;
  data: ModeShareCode | undefined;
}

/** A state that shows a code: what it pre-fills, and whose mode it is. */
interface Shown {
  /** E.g. `#fia` or `#pbt/obt-coach`. */
  trigger: string;
  /** The mode's org when the code is org-qualified, else null. */
  partnerOrg: string | null;
}

/**
 * Everything the panel renders. Variants that show a code carry
 * `trigger` (always a string); the rest carry none, so the card can never
 * show a trigger the worker did not hand back.
 */
export type ModeSharePanelState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "failed"; failure: ShareCodeFailure }
  | { kind: "not-found" }
  | { kind: "slug-invalid" }
  | { kind: "slug-reserved" }
  | { kind: "org-unconfigured" }
  | { kind: "home-org-unknown"; homeOrg: string }
  | { kind: "upgrade-needed" }
  | { kind: "org-unencodable" }
  | { kind: "code-unencodable" }
  | ({ kind: "org-skipped" } & Shown)
  | ({ kind: "collision"; resolvedOrg: string | null } & Shown)
  | ({ kind: "ambiguous"; resolvedOrg: string | null } & Shown)
  | ({ kind: "capped" } & Shown)
  | ({ kind: "unresolved" } & Shown)
  | ({ kind: "group-only" } & Shown)
  | ({ kind: "draft" } & Shown)
  | ({ kind: "unconfigured" } & Shown)
  | ({ kind: "number-invalid" } & Shown)
  | ({ kind: "ready"; url: string } & Shown);

/** States that render a code on the card. */
export function shownTrigger(state: ModeSharePanelState): Shown | null {
  return "trigger" in state
    ? { trigger: state.trigger, partnerOrg: state.partnerOrg }
    : null;
}

/**
 * The gateway org to warn about when the worker reports it has no modes
 * at all (`home_has_modes: false`), else null. Shown beside whatever the
 * panel's state is, never instead of it: a partner mode can still resolve.
 */
export function homeOrgWithoutModes(
  data: ModeShareCode | undefined
): string | null {
  if (data?.capability !== "present" || data.home_has_modes !== false) {
    return null;
  }
  return data.home_org || null;
}

/** Fails the typecheck when a union gains a variant nobody handles. */
function unhandled(value: never): never {
  throw new Error(`Unhandled share-code answer: ${JSON.stringify(value)}`);
}

/**
 * Resolve what the panel shows. Order of precedence:
 *
 * 1. the mode's identity, from its stored slug alone: a slug no trigger
 *    can carry, then a reserved clear-word. Nothing else fixes these, so
 *    they come first, before any request;
 * 2. query lifecycle: loading, and any refetch in flight (so Copy and
 *    Download are never offered on an answer being replaced), then a
 *    share-config failure, then the share-code request's own outcome (a
 *    503 worth retrying, a failure, a missing mode), then configuration
 *    (WHATSAPP_ORG unset or unknown to the worker, a worker without the
 *    share-code route for a partner mode);
 * 3. the worker's verdict: no code at all, then why the code does not
 *    open this mode;
 * 4. the number: missing or invalid.
 *
 * On a worker without the share-code route, a HOME mode falls back to its
 * bare slug with the page's own flags: home modes resolve bare on every
 * worker version, and the BFF decided "home" on the exact org the worker
 * reads. A partner mode is refused, never guessed.
 */
export function resolveModeSharePanelState(
  config: ShareConfigSnapshot,
  shareCode: ShareCodeSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeOrg: string | null | undefined,
  modeName: string
): ModeSharePanelState {
  const slugVerdict = validateModeShareSlug(modeName);
  if (slugVerdict !== "ok") return { kind: slugVerdict };
  if (
    config.pending ||
    config.fetching ||
    shareCode.pending ||
    shareCode.fetching
  ) {
    return { kind: "loading" };
  }
  if (config.error) return { kind: "error" };
  if (shareCode.error || !shareCode.data) {
    return { kind: "failed", failure: "server" };
  }
  const answer = shareCode.data;
  const number = config.supported ? config.whatsappNumber : null;

  switch (answer.capability) {
    case "unavailable":
      return { kind: "unavailable" };
    case "failed":
      return { kind: "failed", failure: answer.failure };
    case "not-found":
      return { kind: "not-found" };
    case "unconfigured":
      return { kind: "org-unconfigured" };
    case "unknown-home-org":
      return { kind: "home-org-unknown", homeOrg: answer.home_org };
    case "absent": {
      if (!answer.home) return { kind: "upgrade-needed" };
      const shown: Shown = {
        trigger: modeShareTrigger(modeName),
        partnerOrg: null,
      };
      const eligibility = modeShareState(flags);
      if (eligibility !== "ready") return { kind: eligibility, ...shown };
      return withNumber(buildModeShareLink(number, modeName), shown);
    }
    case "present":
      return fromWorkerAnswer(answer, number, modeOrg);
    default:
      return unhandled(answer);
  }
}

/** The worker answered: render its verdict, building a link only if it resolves. */
function fromWorkerAnswer(
  answer: Extract<ModeShareCode, { capability: "present" }>,
  number: string | null,
  modeOrg: string | null | undefined
): ModeSharePanelState {
  const { code } = answer;
  if (code === null) return { kind: "org-unencodable" };
  if (!isUrlSafeShareCode(code)) return { kind: "code-unencodable" };
  const shown: Shown = {
    trigger: modeShareTrigger(code),
    partnerOrg: code.includes("/") ? (modeOrg?.trim() ?? null) : null,
  };
  if (answer.resolves) {
    return withNumber(buildShareLinkFromCode(number, code), shown);
  }
  const resolvedOrg = answer.resolved_org ?? null;
  switch (answer.reason) {
    case "draft":
      return { kind: "draft", ...shown };
    case "requires_group":
      return { kind: "group-only", ...shown };
    // Already refused from the slug above; kept for a worker whose clear
    // tokens grow.
    case "reserved":
      return { kind: "slug-reserved" };
    case "collision":
      return { kind: "collision", resolvedOrg, ...shown };
    case "ambiguous":
      return { kind: "ambiguous", resolvedOrg, ...shown };
    case "capped":
      return { kind: "capped", ...shown };
    case "org_skipped":
      return { kind: "org-skipped", ...shown };
    // `not_found`, a missing reason, or one this portal doesn't know yet
    // (the worker contract is additive).
    default:
      return { kind: "unresolved", ...shown };
  }
}

/** The number half: a ready link, or why the number blocks it. */
function withNumber(
  link: ModeShareLinkResult,
  shown: Shown
): ModeSharePanelState {
  if (link.ok) return { kind: "ready", url: link.url, ...shown };
  switch (link.reason) {
    case "number-missing":
      return { kind: "unconfigured", ...shown };
    case "number-invalid":
      return { kind: "number-invalid", ...shown };
    case "code-unencodable":
      return { kind: "code-unencodable" };
    // Ruled out before a link is built (the slug checks come first).
    case "slug-invalid":
    case "slug-reserved":
      return { kind: link.reason };
  }
}
