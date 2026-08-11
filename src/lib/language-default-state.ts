// Pure state machine for the Languages page's org-default control (#286).
//
// The panel has to say one of a small number of things, and each one is a
// different *operational* claim about what end users get. Two of them are
// claims about the ORG and must never be made from an unresolved read:
//
//   pending     → we don't know yet (either query still in flight). Render
//                 nothing: no notice, no control, no toolbar shift.
//   unsupported → the worker has no languages-default route (worker#236
//                 hasn't shipped). Admins get a quiet note; nobody else
//                 sees anything.
//   error       → the read genuinely failed (404/501 resolve as
//                 `unsupported`, so this is a 5xx or a network fault).
//                 Say so — silently claiming the feature doesn't exist
//                 would be a lie the user can't diagnose.
//   none        → no default set: end users only get tuning when they
//                 type `@language`.
//   healthy     → default points at a published language: end users get
//                 that language's tuning without asking.
//   unpublished → default points at a DRAFT. Deliberately legal (stage →
//                 test via the admin draft bypass → publish), but until
//                 it's published end users get nothing.
//   missing     → default points at a slug that isn't in the org's list.
//                 Upstream 409s on deleting the current default, so this
//                 is drift (direct KV edit, or a race), not a normal
//                 state — worth saying out loud rather than mislabelling
//                 it as "unpublished".
//
// `missing` is the reason this function takes the collection's loading
// state rather than a plain array: the default payload is tiny and always
// lands before the catalog, so treating an unresolved list as an empty one
// would fire the drift warning on every page load and every org switch —
// and permanently if the collection query fails.
//
// Keeping all of this out of the component means the wording, the
// severity, and the "should anything render at all?" decision are
// unit-testable without a DOM.

import type { Language, OrgDefaultLanguage } from "@/types/language";

export type LanguageDefaultState =
  | { kind: "pending" }
  | { kind: "unsupported" }
  | { kind: "error" }
  | { kind: "none" }
  | { kind: "healthy"; name: string; label?: string }
  | { kind: "unpublished"; name: string; label?: string }
  | { kind: "missing"; name: string };

export type LanguageDefaultTone = "healthy" | "warning" | "info" | "error";

export interface LanguageDefaultNotice {
  tone: LanguageDefaultTone;
  message: string;
}

export interface LanguageDefaultInputs {
  /** Resolved payload of the org-default query. `undefined` while the
      query is pending OR after it rejected — which is why the two flags
      below are separate inputs and not inferred from it. */
  orgDefault: OrgDefaultLanguage | undefined;
  /** Org-default query still in flight. */
  isPending: boolean;
  /** Org-default query rejected. 404/501 RESOLVE as
      `{ supported: false }` (src/lib/languages-api.ts), so reaching here
      means a real failure — a 5xx, a network fault, a malformed body. */
  isError: boolean;
  /** The org's languages, or `undefined` while the collection query is
      unresolved. Only a RESOLVED list can prove a default is dangling. */
  languages: Pick<Language, "name" | "label" | "published">[] | undefined;
}

export function computeLanguageDefaultState(
  inputs: LanguageDefaultInputs
): LanguageDefaultState {
  const { orgDefault, isPending, isError, languages } = inputs;

  // Error before pending: TanStack reports `isPending: false` once a query
  // settles, including when it settled as a failure, but a caller passing
  // a stale `isPending: true` alongside an error must still surface the
  // error rather than spin forever.
  if (isError) return { kind: "error" };
  // `orgDefault === undefined` covers the honest gap where a caller hasn't
  // wired isPending (and the very first render, before the flag flips).
  if (isPending || orgDefault === undefined) return { kind: "pending" };
  if (orgDefault.supported !== true) return { kind: "unsupported" };

  const name = orgDefault.name;
  if (name === null) return { kind: "none" };

  // A default exists but the catalog hasn't landed: we know there IS a
  // default and nothing else. Stay quiet instead of guessing at published
  // (would understate) or dangling (would slander). If the collection
  // query is what failed, the page's own list-error banner is already
  // saying so — this control has nothing to add.
  if (languages === undefined) return { kind: "pending" };

  const entry = languages.find((l) => l.name === name);
  if (entry === undefined) return { kind: "missing", name };
  return {
    kind: entry.published === true ? "healthy" : "unpublished",
    name,
    ...(entry.label === undefined ? {} : { label: entry.label }),
  };
}

// Human-readable rendering of a state. `null` means "render no notice" —
// the states with nothing truthful to say yet.
//
// `canSetDefault` (admin powers — the worker's PUT gate on
// /api/config/languages-default) only ever changes copy that PRESCRIBES an
// action. A shepherd holding edit+publish on the default language can see
// every one of these states, but cannot act on the ones that require
// writing the org default, so telling them to "pick a new default" sends
// them at a button they will never be shown.
export function describeLanguageDefault(
  state: LanguageDefaultState,
  canSetDefault: boolean
): LanguageDefaultNotice | null {
  switch (state.kind) {
    case "pending":
    case "unsupported":
      return null;
    case "error":
      return {
        tone: "error",
        message:
          "Couldn't load this org's default language. Reload the page to try again — the default itself is unchanged.",
      };
    case "none":
      return {
        tone: "info",
        message:
          "No default language is set — end users only get tuning when they ask for a language with @language.",
      };
    case "healthy":
      return {
        tone: "healthy",
        message: `${displayName(state)} is the org default — end users get its tuning without asking.`,
      };
    case "unpublished":
      return {
        tone: "warning",
        message: `${displayName(state)} is the org default but is still a draft — end users get no tuning until it's published.`,
      };
    case "missing":
      return {
        tone: "warning",
        message: `The org default points at "${state.name}", which isn't in this org's language list. ${
          canSetDefault
            ? "Pick a new default, or clear it."
            : "Ask an admin to pick a new default."
        }`,
      };
  }
}

// May the set/clear control render at all? Only once we know the org's
// actual default state — offering "Set as default" against an unknown
// current value invites a write the admin can't predict the effect of.
// (Whether the VIEWER may use it is a separate, admin-only gate.)
export function isDefaultControlAvailable(
  state: LanguageDefaultState
): boolean {
  switch (state.kind) {
    case "pending":
    case "unsupported":
    case "error":
      return false;
    default:
      return true;
  }
}

// The slug the default currently points at, or null. Convenience for the
// per-row "Default" badge so components don't re-destructure the union.
export function defaultLanguageName(
  state: LanguageDefaultState
): string | null {
  switch (state.kind) {
    case "healthy":
    case "unpublished":
    case "missing":
      return state.name;
    default:
      return null;
  }
}

function displayName(state: { name: string; label?: string }): string {
  return `"${state.label ?? state.name}"`;
}
