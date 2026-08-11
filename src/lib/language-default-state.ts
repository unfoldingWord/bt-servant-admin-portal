// Pure state machine for the Languages page's org-default control (#286).
//
// The panel has to say one of a small number of things, and each one is a
// different *operational* claim about what end users get:
//
//   unsupported → the worker has no languages-default route (worker#236
//                 hasn't shipped); we say nothing about defaults at all.
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
// Keeping this out of the component means the wording and the severity are
// unit-testable without a DOM.

import type { Language, OrgDefaultLanguage } from "@/types/language";

export type LanguageDefaultState =
  | { kind: "unsupported" }
  | { kind: "none" }
  | { kind: "healthy"; name: string; label?: string }
  | { kind: "unpublished"; name: string; label?: string }
  | { kind: "missing"; name: string };

export type LanguageDefaultTone = "healthy" | "warning" | "info";

export interface LanguageDefaultNotice {
  tone: LanguageDefaultTone;
  message: string;
}

export function computeLanguageDefaultState(
  orgDefault: OrgDefaultLanguage | undefined,
  languages: Pick<Language, "name" | "label" | "published">[] | undefined
): LanguageDefaultState {
  // `undefined` = the query hasn't answered yet. Treat it exactly like an
  // absent endpoint: render nothing rather than flashing "no default set"
  // (which is a claim, not a loading state) on every page load.
  if (orgDefault === undefined || orgDefault.supported !== true) {
    return { kind: "unsupported" };
  }
  const name = orgDefault.name;
  if (name === null) return { kind: "none" };

  const entry = (languages ?? []).find((l) => l.name === name);
  if (entry === undefined) return { kind: "missing", name };
  return {
    kind: entry.published === true ? "healthy" : "unpublished",
    name,
    ...(entry.label === undefined ? {} : { label: entry.label }),
  };
}

// Human-readable rendering of a state. `null` means "render nothing" —
// only the unsupported state, which the control hides itself for.
export function describeLanguageDefault(
  state: LanguageDefaultState
): LanguageDefaultNotice | null {
  switch (state.kind) {
    case "unsupported":
      return null;
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
        message: `The org default points at "${state.name}", which isn't in this org's language list. Pick a new default.`,
      };
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
