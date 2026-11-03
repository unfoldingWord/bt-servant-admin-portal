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
 * flags. Same order as the worker's `staticReason` (bt-servant-worker
 * src/utils/mode-share-code.ts): draft, then group-only. The worker's
 * `invalid_mode`, which it checks first for a partner org's mode, is not
 * knowable from the flags; `resolveModeSharePanelState` lets that answer
 * win over these.
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
  /** That first load is waiting for the network (offline). */
  paused: boolean;
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
   * The answer to show: one shown in this open of the panel. TanStack
   * keeps it through a refetch, also a failed one; it is withheld only
   * while `checking`.
   */
  answer: ModeShareCode | undefined;
  /**
   * Fetching with no answer from this open yet (first load, or a reopen
   * whose cached answer was stale): never Copy/Download on an answer about
   * to be replaced.
   */
  checking: boolean;
  /**
   * Why the last fetch in this open didn't answer: a transient failure, or
   * "network" while the query is paused offline. Null otherwise.
   */
  failure: ShareCodeTransient | null;
}

/**
 * What `useModeShareCode` reads from its TanStack query. The panel mounts
 * the query per open, so "after mount" means "in this open".
 */
export interface ShareCodeQueryView {
  data: ModeShareCode | undefined;
  dataUpdatedAt: number;
  fetchStatus: "fetching" | "paused" | "idle";
  error: unknown;
  /** TanStack's own: a fetch (success or error) finished since mount. */
  isFetchedAfterMount: boolean;
}

/**
 * What the cache held when this mount first asked, taken once. TanStack's
 * first result is optimistic: a stale or missing answer already shows as
 * fetching (or paused, offline), so an idle answer there was fresh. A
 * fresh answer is shown at once and stays through a later background
 * refetch; a stale one is shown only once a fetch since replaces it.
 */
export interface ShareCodeStart {
  fresh: boolean;
  dataUpdatedAt: number;
}

export function shareCodeStart(view: ShareCodeQueryView): ShareCodeStart {
  return {
    fresh: view.data !== undefined && view.fetchStatus === "idle",
    dataUpdatedAt: view.dataUpdatedAt,
  };
}

/**
 * The snapshot for this open. An answer counts as shown when it was fresh
 * at the start or was fetched since. An error counts only when it came
 * from a fetch in this open (`isFetchedAfterMount`), so a failed refresh
 * from a previous open never shows. Paused (offline) is the network
 * failure, with Try again, not "checking".
 */
export function shareCodeSnapshot(
  view: ShareCodeQueryView,
  start: ShareCodeStart
): ShareCodeSnapshot {
  const shown =
    view.data !== undefined &&
    (start.fresh || view.dataUpdatedAt > start.dataUpdatedAt);
  const failed =
    view.isFetchedAfterMount && view.error !== null && view.error !== undefined;
  const failure: ShareCodeTransient | null =
    view.fetchStatus === "paused"
      ? "network"
      : failed
        ? view.error instanceof ShareCodeRequestError
          ? view.error.kind
          : "server"
        : null;
  return {
    answer: shown ? view.data : undefined,
    checking: !shown && failure === null,
    failure,
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
  /** Share-config hasn't loaded yet. */
  | { kind: "loading-config" }
  /** Share-config is loaded; this mode's code is being checked. */
  | { kind: "checking-code" }
  | { kind: "error" }
  | { kind: "retry"; cause: ShareCodeTransient }
  | { kind: "failed"; failure: ShareCodeFailure }
  | { kind: "not-found" }
  | { kind: "slug-reserved" }
  | { kind: "org-unconfigured" }
  | { kind: "upgrade-needed" }
  | { kind: "org-unencodable" }
  | { kind: "code-unencodable" }
  /**
   * The page has the mode saved as published and private-chat OK, but BT
   * Servant sees it as unpublished (`draft`) or group-only. Either side
   * may be the stale one (a save not yet seen, or another admin's change
   * the page hasn't loaded), so the panel says what BT Servant sees.
   */
  | { kind: "worker-sees"; sees: "draft" | "group-only" }
  | { kind: "invalid-mode" }
  | ({ kind: "org-skipped" } & Shown)
  | ({
      kind: "collision";
      resolvedOrg: string | null;
      /**
       * The code opens another mode of this same org (an alias clash),
       * not another org's.
       */
      sameOrg: boolean;
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
export function workerSaysUnshareable(
  data: ModeShareCode | undefined
): boolean {
  return (
    data?.capability === "present" &&
    !data.resolves &&
    (data.reason === "draft" || data.reason === "requires_group")
  );
}

/** States that don't come from the worker's answer. */
const NOT_FROM_ANSWER: ReadonlySet<ModeSharePanelState["kind"]> = new Set([
  "loading-config",
  "checking-code",
  "error",
  "retry",
  "draft",
  "group-only",
]);

/**
 * A background refresh failed while the panel shows the worker's last
 * answer, any answer (a code, or a definite state such as not-found or
 * upgrade-needed): the panel keeps it and adds a note with Try again.
 */
export function refreshFailed(
  state: ModeSharePanelState,
  shareCode: ShareCodeSnapshot
): boolean {
  return (
    shareCode.answer !== undefined &&
    shareCode.failure !== null &&
    !NOT_FROM_ANSWER.has(state.kind)
  );
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
 * re-ask it started runs (`busy`, see `nextRetryClick`) it stays on
 * screen, disabled ("Checking…"), even if the state behind it turns to
 * checking, so it can't queue repeated calls.
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
    state.kind === "worker-sees" ||
    answerUncertain(state) ||
    refreshFailed(state, shareCode)
  ) {
    return { target: "share-code", busy: false };
  }
  return null;
}

/** A Try again click in this open of the panel. */
export interface RetryClick {
  target: RetryTarget;
  /** The retried query has been seen fetching (or its refetch settled). */
  started: boolean;
}

/** A TanStack query's `fetchStatus`. */
export type FetchStatus = "fetching" | "paused" | "idle";

/**
 * The click still in force for this render, or null. Busy is the retried
 * query's own fetching: it lasts from the click until that query has
 * fetched and stopped, so a refetch cancelled and restarted under it (a
 * mode write) stays busy. Paused (offline) ends it, so Try again stays
 * available while the panel says to check the connection. Returns `prev`
 * itself when nothing changed. The panel's per-open mount drops a click
 * on close.
 */
export function nextRetryClick(
  prev: RetryClick | null,
  status: Record<RetryTarget, FetchStatus>
): RetryClick | null {
  if (prev === null) return null;
  const s = status[prev.target];
  if (s === "paused") return null;
  if (s === "fetching") return prev.started ? prev : { ...prev, started: true };
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
 * 1. the page's own saved flags: draft, then group-only (the worker's
 *    order), unless the worker calls the mode damaged (`invalid_mode`,
 *    which the worker puts first for a partner org's mode). Publishing or
 *    turning off group-only is the author's to do first;
 * 2. query lifecycle: share-config loading (or offline) or failed, then
 *    the share code checking (see ShareCodeSnapshot) or failed with
 *    nothing to show;
 * 3. the worker's answer, as is: configuration (WHATSAPP_ORG unset or
 *    unusable, a worker without the share-code route), a definite
 *    failure (a name the worker rejects included), no code at all, a link
 *    if the code resolves, else why not (a reserved name included). A
 *    draft / group-only answer here means the worker and the page
 *    disagree ("worker-sees");
 * 4. the number: missing or invalid.
 *
 * The mode's name is not checked here: the worker decides (400
 * `invalid_mode_name`, reason `reserved`).
 */
export function resolveModeSharePanelState(
  config: ShareConfigSnapshot,
  shareCode: ShareCodeSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeOrg: string | null | undefined
): ModeSharePanelState {
  const eligibility = modeShareState(flags);
  if (eligibility !== "ready") {
    // The worker's own order (#477 `staticReason`): a damaged stored mode
    // of a partner org is `invalid_mode` before draft or group-only, since
    // chat drops it whatever its flags. Only the worker can tell, so it is
    // asked for every mode; any other answer leaves the page's flags in
    // charge.
    const { answer } = shareCode;
    if (
      answer?.capability === "present" &&
      !answer.resolves &&
      answer.reason === "invalid_mode"
    ) {
      return { kind: "invalid-mode" };
    }
    return { kind: eligibility };
  }
  // Only a first load blocks: a background refetch keeps a ready QR.
  // Offline before it ever loaded: the settings error, with Try again.
  if (config.pending && config.paused) return { kind: "error" };
  if (config.pending) return { kind: "loading-config" };
  if (config.error) return { kind: "error" };
  if (shareCode.checking) return { kind: "checking-code" };
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
    // The page has it published + private-chat OK (checked first): the
    // two sides disagree, and either may be stale.
    case "draft":
      return { kind: "worker-sees", sees: "draft" };
    case "requires_group":
      return { kind: "worker-sees", sees: "group-only" };
    // A name the worker's classifier reserves (`#default`, `#none`,
    // `#clear` take a user out of their mode).
    case "reserved":
      return { kind: "slug-reserved" };
    case "collision":
      return {
        kind: "collision",
        resolvedOrg,
        // #477 names this same org for an alias clash inside it.
        // Exact, like the worker's org keys (#247/#253): " pbt" and "pbt"
        // are different orgs, so a cross-org clash never reads as this one.
        sameOrg: resolvedOrg !== null && resolvedOrg === modeOrg,
        uncertain,
        ...shown,
      };
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
