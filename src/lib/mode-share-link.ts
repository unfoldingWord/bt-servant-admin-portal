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
// worker says resolves. On a worker without that route no code is offered
// for any mode; the panel says a newer BT Servant is needed.
//
// Both inputs are treated as untrusted: the number is an operator-set env
// var (typo-prone), the slug is user-authored config. Nothing reaches the
// URL without passing the shape check.

import { sanitizeFilenamePart } from "@/lib/mode-export";
import {
  ShareCodeRequestError,
  type ModeShareCode,
  type ShareCodeFailure,
  type ShareCodeTransient,
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
  | "code-unencodable";

export type ModeShareLinkResult =
  | { ok: true; url: string; digits: string; trigger: string }
  | { ok: false; reason: ModeShareLinkFailure };

/**
 * Build the share link for a code: the worker's code when it says the code
 * resolves (bare or `<orgslug>/<slug>`). The code is trusted as given;
 * this is the one
 * place that checks it can be carried in a URL (`isUrlSafeShareCode`).
 */
export function buildShareLinkFromCode(
  rawNumber: string | null | undefined,
  code: string
): ModeShareLinkResult {
  if (!rawNumber || rawNumber.trim() === "") {
    return { ok: false, reason: "number-missing" };
  }
  const digits = normalizeWhatsAppNumber(rawNumber);
  if (!digits) return { ok: false, reason: "number-invalid" };
  if (!isUrlSafeShareCode(code)) {
    return { ok: false, reason: "code-unencodable" };
  }
  const trigger = modeShareTrigger(code);
  // `encodeURIComponent` turns the `#` into `%23` and a qualifier's `/`
  // into `%2F` (the worker's own welcome link does the same); the code's
  // [a-z0-9-] alphabet is untouched, which is what keeps the link legible.
  const url = `${WA_ME_ORIGIN}/${digits}?text=${encodeURIComponent(trigger)}`;
  return { ok: true, url, digits, trigger };
}

export type ModeShareState = "ready" | "group-only" | "draft";

/**
 * Whether a scanned QR could reach this mode, from the page's own saved
 * flags. The panel checks this BEFORE asking the worker, and asks only for
 * a published, non-group-only mode. Same order as the worker's
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
  /** First load: nothing known yet. */
  pending: boolean;
  /**
   * The last fetch failed and there is no answer to fall back on. A failed
   * or running background refetch over an answer blocks nothing.
   */
  error: boolean;
  /** `false` when the BFF route is absent (older deploy). */
  supported: boolean;
  whatsappNumber: string | null;
}

/**
 * What the share-code query currently knows, as `useModeShareCode` derives
 * it (that hook owns the TanStack details).
 */
export interface ShareCodeSnapshot {
  /**
   * The answer to show. TanStack keeps it through a refetch, also a failed
   * one; it is withheld only while `checking`.
   */
  answer: ModeShareCode | undefined;
  /**
   * The current query key is fetching and has no data from this open of
   * the panel (first load, a reopen past the stale time, or a key change
   * while open): never Copy/Download on an answer about to be replaced.
   */
  checking: boolean;
  /** The last fetch failed transiently (with or without a current answer). */
  failure: ShareCodeTransient | null;
}

/**
 * Which (open, query key) pair the panel is showing, and what the share
 * code's cache held when that pair began.
 */
export interface OpenMark {
  /** The query key while the panel is open; null while closed. */
  openKey: string | null;
  /** The cache's `dataUpdatedAt` when the pair began. */
  at: number;
  /**
   * The cache held a FRESH answer when the pair began. It is shown at once
   * (no fetch), so it counts as shown in this open: a later background
   * refetch keeps it on the card.
   */
  freshAtOpen: boolean;
}

/** Start a new mark when (open, key) changes; otherwise keep it. */
export function nextOpenMark(
  prev: OpenMark,
  openKey: string | null,
  cache: { dataUpdatedAt: number; hasData: boolean; isStale: boolean }
): OpenMark {
  if (prev.openKey === openKey) return prev;
  return {
    openKey,
    at: cache.dataUpdatedAt,
    freshAtOpen: cache.hasData && !cache.isStale,
  };
}

/** What `useModeShareCode` reads from its TanStack query. */
export interface ShareCodeQueryView {
  data: ModeShareCode | undefined;
  dataUpdatedAt: number;
  isFetching: boolean;
  error: unknown;
}

/**
 * The snapshot for the current (open, key).
 *
 * An answer counts as shown in this open when it was fresh in the cache
 * at open (shown at once) or was fetched since. Only that answer is ever
 * offered: a background refetch keeps it, and a failed one keeps it with
 * the refresh note. Data from a previous open that was stale at open is
 * never offered. While its refetch runs the panel is "checking", and if
 * that refetch fails the panel shows the failure with Try again, not the
 * old answer.
 */
export function shareCodeSnapshot(
  q: ShareCodeQueryView,
  mark: OpenMark
): ShareCodeSnapshot {
  const noError = q.error === null || q.error === undefined;
  const shownThisOpen =
    q.data !== undefined && (mark.freshAtOpen || q.dataUpdatedAt > mark.at);
  return {
    answer: shownThisOpen ? q.data : undefined,
    checking: !shownThisOpen && (q.isFetching || noError),
    failure: noError
      ? null
      : q.error instanceof ShareCodeRequestError
        ? q.error.kind
        : "server",
  };
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
  | { kind: "retry"; cause: ShareCodeTransient }
  | { kind: "failed"; failure: ShareCodeFailure }
  | { kind: "not-found" }
  | { kind: "slug-invalid" }
  | { kind: "slug-reserved" }
  | { kind: "org-unconfigured" }
  | { kind: "upgrade-needed" }
  | { kind: "org-unencodable" }
  | { kind: "code-unencodable" }
  | { kind: "behind" }
  | { kind: "invalid-mode" }
  | ({ kind: "org-skipped" } & Shown)
  | ({
      kind: "collision";
      resolvedOrg: string | null;
      /** Another org couldn't be read: this may change on a re-check. */
      uncertain: boolean;
    } & Shown)
  | ({
      kind: "ambiguous";
      resolvedOrg: string | null;
      uncertain: boolean;
    } & Shown)
  | ({ kind: "capped" } & Shown)
  | ({ kind: "unresolved"; uncertain: boolean } & Shown)
  | { kind: "group-only" }
  | { kind: "draft" }
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
 * The worker still says draft or group-only for a mode the page has saved
 * as published and private-chat OK (the panel only asks for those): its
 * KV read predates the save. Shown as one plain "not seen the latest
 * change yet" state with a manual Try again, and never cached.
 */
export function workerBehindPage(data: ModeShareCode | undefined): boolean {
  return (
    data?.capability === "present" &&
    !data.resolves &&
    (data.reason === "draft" || data.reason === "requires_group")
  );
}

/**
 * A background refresh failed while an answer is on the card: the panel
 * keeps the answer and adds a note with Try again.
 */
export function refreshFailed(
  state: ModeSharePanelState,
  shareCode: ShareCodeSnapshot
): boolean {
  return shownTrigger(state) !== null && shareCode.failure !== null;
}

/**
 * The worker's verdict rests on another org it couldn't read just now
 * (`resolved_org_uncertain`): the panel adds a "may change" line with Try
 * again.
 */
export function answerUncertain(state: ModeSharePanelState): boolean {
  return (
    (state.kind === "collision" ||
      state.kind === "ambiguous" ||
      state.kind === "unresolved") &&
    state.uncertain
  );
}

/** Which query a Try again re-asks. */
export type RetryTarget = "config" | "share-code";

/**
 * The Try again control: shown for a retryable state (the settings error
 * re-asks share-config; everything else the share code), and for a
 * background refresh that failed under an answer on the card. While the
 * re-ask it started runs (`busy`, see `nextRetryClick`) it stays on screen, disabled ("Checking…"), even if
 * the state behind it turns to "loading", so it can't queue repeated
 * calls.
 */
export function retryControl(
  state: ModeSharePanelState,
  shareCode: ShareCodeSnapshot,
  busy: RetryTarget | null
): { target: RetryTarget; busy: boolean } | null {
  if (busy !== null) return { target: busy, busy: true };
  if (state.kind === "error") return { target: "config", busy: false };
  if (
    state.kind === "retry" ||
    state.kind === "behind" ||
    answerUncertain(state) ||
    refreshFailed(state, shareCode)
  ) {
    return { target: "share-code", busy: false };
  }
  return null;
}

/** A Try again click, tied to the (open, mode) pair it was made in. */
export interface RetryClick {
  /** The pair's key; a click from another pair (or a closed panel) is void. */
  pair: string;
  target: RetryTarget;
  /** The retried query has been seen fetching (or its refetch settled). */
  started: boolean;
}

/**
 * The click still in force for this render, or null. Busy is the retried
 * query's own fetching: it lasts from the click until that query has
 * fetched and stopped, so a refetch cancelled and restarted under it (a
 * mode write) stays busy. A click from another pair (closed, or switched
 * mode) is dropped. Returns `prev` itself when nothing changed.
 */
export function nextRetryClick(
  prev: RetryClick | null,
  pair: string | null,
  fetching: Record<RetryTarget, boolean>
): RetryClick | null {
  if (prev === null) return null;
  if (prev.pair !== pair) return null;
  const isFetching = fetching[prev.target];
  if (isFetching) return prev.started ? prev : { ...prev, started: true };
  return prev.started ? null : prev;
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
 *    can carry, then a reserved clear-word;
 * 2. the page's own saved flags: draft, then group-only (the worker's
 *    order). The worker is not asked about either; publishing or turning
 *    off group-only is the author's to do first;
 * 3. query lifecycle: share-config loading or failed, then the share code
 *    checking (see ShareCodeSnapshot) or failed with nothing to show;
 * 4. the worker's answer, as is: configuration (WHATSAPP_ORG unset or
 *    unusable, a worker without the share-code route), a definite
 *    failure, no code at all, a link if the code resolves, else why not.
 *    A draft / group-only answer here means the worker hasn't seen the
 *    page's latest save ("behind");
 * 5. the number: missing or invalid.
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
  const eligibility = modeShareState(flags);
  if (eligibility !== "ready") return { kind: eligibility };
  // Only a first load blocks: a background refetch keeps a ready QR.
  if (config.pending) return { kind: "loading" };
  if (config.error) return { kind: "error" };
  if (shareCode.checking) return { kind: "loading" };
  const { answer } = shareCode;
  if (answer === undefined) {
    return { kind: "retry", cause: shareCode.failure ?? "server" };
  }
  const number = config.supported ? config.whatsappNumber : null;

  switch (answer.capability) {
    case "failed":
      return { kind: "failed", failure: answer.failure };
    case "not-found":
      return { kind: "not-found" };
    case "unconfigured":
      return { kind: "org-unconfigured" };
    case "upgrade-needed":
      return { kind: "upgrade-needed" };
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
  const shown: Shown = {
    trigger: modeShareTrigger(code),
    partnerOrg: code.includes("/") ? (modeOrg?.trim() ?? null) : null,
  };
  if (answer.resolves) {
    return withNumber(buildShareLinkFromCode(number, code), shown);
  }
  const resolvedOrg = answer.resolved_org ?? null;
  const uncertain = answer.resolved_org_uncertain === true;
  switch (answer.reason) {
    // The page saved published + private-chat OK (checked first), so the
    // worker hasn't seen that save yet.
    case "draft":
    case "requires_group":
      return { kind: "behind" };
    // Already refused from the slug above; kept for a worker whose clear
    // tokens grow.
    case "reserved":
      return { kind: "slug-reserved" };
    case "collision":
      return { kind: "collision", resolvedOrg, uncertain, ...shown };
    case "ambiguous":
      return { kind: "ambiguous", resolvedOrg, uncertain, ...shown };
    case "capped":
      return { kind: "capped", ...shown };
    case "org_skipped":
      return { kind: "org-skipped", ...shown };
    // Permanent until the stored mode is repaired: no Try again.
    case "invalid_mode":
      return { kind: "invalid-mode" };
    // `not_found`, a missing reason, or one this portal doesn't know yet
    // (the worker contract is additive).
    default:
      return { kind: "unresolved", uncertain, ...shown };
  }
}

/** The number half: a ready link, or why the link can't be built. */
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
  }
}
