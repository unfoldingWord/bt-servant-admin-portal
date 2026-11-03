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
 * The share-config number as `wa.me` digits, or why it can't go in a
 * link: unset, or not a plausible E.164 number.
 */
export function whatsAppNumber(
  raw: string | null | undefined
):
  | { ok: true; digits: string }
  | { ok: false; kind: "unconfigured" | "number-invalid" } {
  if (!raw || raw.trim() === "") return { ok: false, kind: "unconfigured" };
  const digits = normalizeWhatsAppNumber(raw);
  return digits === null
    ? { ok: false, kind: "number-invalid" }
    : { ok: true, digits };
}

/**
 * The message the QR pre-fills: the worker's mode trigger for `name`, which
 * is either a bare slug or an org-qualified `<orgslug>/<slug>`.
 */
export function modeShareTrigger(name: string): string {
  return `#${name}`;
}

// Mirrors bt-servant-worker at cd20c99 (the #477 contract this PR targets):
// `MODE_NAME_PATTERN` in src/types/prompt-overrides.ts:79, which the
// share-code route's 400 `invalid_mode_name` applies; and `CLEAR_TOKENS`
// in src/services/classifier/index.ts:82, which its `reserved` reason
// applies (src/utils/mode-share-code.ts uses both but defines neither).
// tests/mode-share-link.test.ts pins both values, so a change here is a
// deliberate one, made with the worker's.
//
// The worker's `MODE_NAME_PATTERN`: lowercase alphanumerics and inner
// hyphens, 1–64 chars, no underscores. Stricter than the portal's
// `slugifyModeName` (which keeps `_`), and the one the worker enforces on
// every mode route (400 `invalid_mode_name`) — so it is the one a trigger
// has to satisfy.
export const MODE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Reserved by the worker's classifier as "clear the active mode"
// (`CLEAR_TOKENS`, src/services/classifier/index.ts). Checked BEFORE mode
// matching there, so `#default` can never reach a mode named `default`;
// a QR for one would silently deactivate whatever mode the user had.
export const RESERVED_TRIGGERS: ReadonlySet<string> = new Set([
  "default",
  "none",
  "clear",
]);

export type ModeShareSlugVerdict = "ok" | "slug-invalid" | "slug-reserved";

/**
 * Can this slug be carried by a `#` trigger at all? Independent of the
 * number and of publish state — it is about the mode's identity, so the
 * panel reports it before anything else (a draft named `default` should
 * hear "rename", not "publish"). A stored slug never contains `/`. The
 * worker would say the same (400 `invalid_mode_name`, reason `reserved`),
 * and those answers still map to the same states.
 */
export function validateModeShareSlug(slug: string): ModeShareSlugVerdict {
  if (!MODE_NAME_PATTERN.test(slug)) return "slug-invalid";
  if (RESERVED_TRIGGERS.has(slug)) return "slug-reserved";
  return "ok";
}

// The worker is the authority on which codes exist and how long they are
// (it does not cap the org half). This bound only refuses an absurd URL;
// it is not a contract and is well above any real code.
const MAX_SHARE_CODE_LENGTH = 1000;
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

export type ModeShareLinkResult =
  | { ok: true; url: string; trigger: string }
  | { ok: false; reason: "code-unencodable" };

/**
 * Build the share link for a code: the worker's code when it says the code
 * resolves (bare or `<orgslug>/<slug>`), on a number already normalised
 * to `wa.me` digits (`whatsAppNumber`). The code is trusted as given;
 * this is the one place that checks it can be carried in a URL
 * (`isUrlSafeShareCode`).
 */
export function buildShareLinkFromCode(
  digits: string,
  code: string
): ModeShareLinkResult {
  if (!isUrlSafeShareCode(code)) {
    return { ok: false, reason: "code-unencodable" };
  }
  const trigger = modeShareTrigger(code);
  // `encodeURIComponent` turns the `#` into `%23` and a qualifier's `/`
  // into `%2F` (the worker's own welcome link does the same); the code's
  // [a-z0-9-] alphabet is untouched, which is what keeps the link legible.
  const url = `${WA_ME_ORIGIN}/${digits}?text=${encodeURIComponent(trigger)}`;
  return { ok: true, url, trigger };
}

export type ModeShareState = "ready" | "group-only" | "draft";

/**
 * Whether a scanned QR could reach this mode, from the page's own saved
 * flags. Same order as the worker's `staticReason` (bt-servant-worker
 * src/utils/mode-share-code.ts): draft, then group-only. The worker's
 * `invalid_mode`, which it checks first for a partner org's mode, is not
 * knowable from the flags; it only matters once the mode is published,
 * and the worker reports it then.
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
  /**
   * The org the answer is about (the BFF's `queried_org`) when the code
   * is org-qualified, else null.
   */
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
  /** The stored slug can't be a trigger (the worker's name pattern). */
  | { kind: "slug-invalid" }
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
  /** The worker gave no code and no reason this portal reads otherwise. */
  | { kind: "unresolved"; uncertain: boolean }
  | { kind: "group-only" }
  | { kind: "draft" }
  /** WHATSAPP_NUMBER is unset (or the share-config route is absent). */
  | { kind: "unconfigured" }
  /** WHATSAPP_NUMBER isn't a plausible E.164 number. */
  | { kind: "number-invalid" }
  | ({ kind: "ready"; url: string } & Shown);

/** States that render a code on the card. */
export function shownTrigger(state: ModeSharePanelState): Shown | null {
  return "trigger" in state
    ? { trigger: state.trigger, partnerOrg: state.partnerOrg }
    : null;
}

/**
 * The worker says draft or group-only for a mode the page has saved as
 * published and private-chat OK (the panel only asks for those). Either
 * side may be stale, so the answer is never reused (stale time 0) and the
 * panel offers Try again ("worker-sees").
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
  "slug-invalid",
  "error",
  "retry",
  "draft",
  "group-only",
]);

/**
 * Answers the panel never reuses from the cache (stale time 0), each
 * offered with Try again: the worker and the page disagree on draft /
 * group-only; "needs a newer BT Servant" (a plain 404 may be an edge
 * hiccup, not an old worker); not found; and the definite failures (a
 * rename, repair or permission change elsewhere can clear any of them).
 */
export function answerNeverReused(data: ModeShareCode | undefined): boolean {
  if (workerSaysUnshareable(data)) return true;
  return (
    data?.capability === "upgrade-needed" ||
    data?.capability === "not-found" ||
    data?.capability === "failed"
  );
}

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
 * re-ask it started runs (`busy`, from the click until its refetch
 * promise settles) it stays on screen, disabled ("Checking…"), even if
 * the state behind it turns to checking, so it can't queue repeated calls.
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
    // Never reused, so worth re-asking (see `answerNeverReused`).
    state.kind === "upgrade-needed" ||
    state.kind === "not-found" ||
    state.kind === "failed" ||
    answerUncertain(state) ||
    refreshFailed(state, shareCode)
  ) {
    return { target: "share-code", busy: false };
  }
  return null;
}

/**
 * The gateway org's note when the worker reports it has no modes at all
 * (`home_has_modes: false`), else null; `name` is null when the BFF
 * withheld the org's name. Shown beside whatever the
 * panel's state is, never instead of it: a partner mode can still resolve.
 */
export function homeOrgWithoutModes(
  data: ModeShareCode | undefined
): { name: string | null } | null {
  if (data?.capability !== "present" || data.home_has_modes !== false) {
    return null;
  }
  // The BFF names it only to a super-admin or its own org's admins.
  return { name: data.home_org || null };
}

/** Fails the typecheck when a union gains a variant nobody handles. */
function unhandled(value: never): never {
  throw new Error(`Unhandled share-code answer: ${JSON.stringify(value)}`);
}

/**
 * What the panel shows, in one call: a test-only convenience. The panel
 * itself composes `resolvePreWorkerStage` (steps 1–4, which also gates
 * the share-code query) and `resolveWithShareCode` (steps 5–6). Order of
 * precedence:
 *
 * 1. the mode's name, from its stored slug alone: a slug no trigger can
 *    carry, then a reserved clear-word (a draft named `default` hears
 *    "rename", not "publish");
 * 2. the page's own saved flags: draft, then group-only (the worker's
 *    order). The worker is not asked about either; publishing or turning
 *    off group-only is the author's to do first. (The worker's
 *    `invalid_mode`, which it checks first for a partner org's mode, is
 *    reported once the mode is published and asked about);
 * 3. share-config loading (or offline) or failed;
 * 4. the WhatsApp number: missing or invalid (the worker isn't asked
 *    without a usable one);
 * 5. the share code checking (see ShareCodeSnapshot) or failed with
 *    nothing to show;
 * 6. the worker's answer, as is: configuration (WHATSAPP_ORG unset or
 *    unusable, a worker without the share-code route), a definite
 *    failure (a name the worker rejects included), no code at all, a link
 *    if the code resolves, else why not (a reserved name included). A
 *    draft / group-only answer here means the worker and the page
 *    disagree ("worker-sees").
 */
export function resolveModeSharePanelState(
  config: ShareConfigSnapshot,
  shareCode: ShareCodeSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeName: string
): ModeSharePanelState {
  return resolveWithShareCode(
    resolvePreWorkerStage(config, flags, modeName),
    shareCode
  );
}

/**
 * Steps 1–4 of the order (listed on `resolveModeSharePanelState`),
 * which don't depend on the worker: either the state to show, or "needs
 * share code" with the number to build the link from. The panel asks the worker exactly when
 * this says it needs the share code, so the query's gate and the
 * resolver can't drift apart.
 */
export type PreWorkerStage =
  | { needsShareCode: false; state: ModeSharePanelState }
  | { needsShareCode: true; digits: string };

export function resolvePreWorkerStage(
  config: ShareConfigSnapshot,
  flags: { published?: boolean; requires_group?: boolean },
  modeName: string
): PreWorkerStage {
  const stop = (state: ModeSharePanelState): PreWorkerStage => ({
    needsShareCode: false,
    state,
  });
  const slugVerdict = validateModeShareSlug(modeName);
  if (slugVerdict !== "ok") return stop({ kind: slugVerdict });
  const eligibility = modeShareState(flags);
  if (eligibility !== "ready") return stop({ kind: eligibility });
  // Only a first load blocks: a background refetch keeps a ready QR.
  // Offline before it ever loaded: the settings error, with Try again.
  if (config.pending && config.paused) return stop({ kind: "error" });
  if (config.pending) return stop({ kind: "loading-config" });
  if (config.error) return stop({ kind: "error" });
  // The number before the worker: without a usable one no link can be
  // built, so the worker isn't asked.
  const number = whatsAppNumber(
    config.supported ? config.whatsappNumber : null
  );
  if (!number.ok) return stop({ kind: number.kind });
  return { needsShareCode: true, digits: number.digits };
}

/** Steps 5–6: the pre-worker stage, then the share code and its answer. */
export function resolveWithShareCode(
  stage: PreWorkerStage,
  shareCode: ShareCodeSnapshot
): ModeSharePanelState {
  if (!stage.needsShareCode) return stage.state;
  if (shareCode.checking) return { kind: "checking-code" };
  const { answer } = shareCode;
  if (answer === undefined) {
    return { kind: "retry", cause: shareCode.failure ?? "server" };
  }

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
      return fromWorkerAnswer(answer, stage.digits);
    default:
      return unhandled(answer);
  }
}

/** The worker answered: render its verdict, building a link only if it resolves. */
function fromWorkerAnswer(
  answer: Extract<ModeShareCode, { capability: "present" }>,
  digits: string
): ModeSharePanelState {
  const { code } = answer;
  if (code === null) {
    return withoutCode(answer.reason, answer.resolved_org_uncertain === true);
  }
  const shown: Shown = {
    trigger: modeShareTrigger(code),
    // The org the BFF asked about, exactly as sent: the org this code's
    // answer is about, never the page's (possibly still settling) org.
    partnerOrg: code.includes("/") ? answer.queried_org : null,
  };
  if (answer.resolves) {
    return linkState(buildShareLinkFromCode(digits, code), shown);
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
        // Against the exact org the BFF asked about (`queried_org`), byte
        // for byte like the worker's org keys (#247/#253): the client
        // never guesses whether " pbt" and "pbt" are the same org.
        sameOrg: resolvedOrg !== null && resolvedOrg === answer.queried_org,
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

/**
 * No code at all (`code: null`; never with `resolves: true`, which the
 * parser rejects). Read by the reason: `org_skipped` alone means the org
 * name has no usable slug; any other reason (a missing, unknown or
 * code-bound one included) reads as "does not open this mode", with no
 * trigger to show.
 */
function withoutCode(
  reason: string | undefined,
  uncertain: boolean
): ModeSharePanelState {
  switch (reason) {
    case "draft":
      return { kind: "worker-sees", sees: "draft" };
    case "requires_group":
      return { kind: "worker-sees", sees: "group-only" };
    case "invalid_mode":
      return { kind: "invalid-mode" };
    case "reserved":
      return { kind: "slug-reserved" };
    case "org_skipped":
      return { kind: "org-unencodable" };
    default:
      return { kind: "unresolved", uncertain };
  }
}

/** A ready link, or the code the worker returned can't go in a URL. */
function linkState(
  link: ModeShareLinkResult,
  shown: Shown
): ModeSharePanelState {
  return link.ok
    ? { kind: "ready", url: link.url, ...shown }
    : { kind: "code-unencodable" };
}
