// Ownership gate for the Languages editor's mutation callbacks, lifted out of
// the page so the rule is stated once and tested directly (same shape as
// `autosave-gate`, `context-org-guard`, and `language-bootstrap-gate`).
//
// The editor keeps per-selection local bookkeeping — `draft`, `lastSyncedDoc`,
// `lastSyncedPublished`, `lastSyncedLabel`, `syncedName` — that must belong to
// the CURRENT selection. A selection is not a language name alone: the same
// slug (`en`) can exist in more than one org, so the identity of "what the
// editor is showing" is the pair (org, language).
//
// Every mutation callback captures its target at call time but applies its
// local bookkeeping AFTER an `await`/settle. In that window the user can:
//   - switch languages (the switch dialog offers "discard and switch" even
//     while a save is in flight),
//   - switch org context (super-admins, via the OrgContextSelector), or
//   - both.
// If the callback then stamps its result without re-checking, it writes one
// row's document / published flag / label onto another row's locals, which the
// next autosave dutifully PUTs — a silent cross-row (or cross-org) data loss.
//
// PR #302 fixed every instance it found with an ad-hoc, per-function check
// (`useUiStore.getState().selectedLanguage === name`, `.contextOrg !== org`).
// Those checks were LANGUAGE-ONLY at the bookkeeping sites and were missing
// entirely on `handleDeleteLanguage` (it read the click-time closure). This
// gate replaces them with one uniform (org + language) comparison so no site
// can drift, and closes the org dimension the ad-hoc checks left open.

export interface SelectionTarget {
  /** The org context the mutation was issued under, pinned at call time. */
  org: string | null;
  /** The language the mutation's bookkeeping belongs to. */
  language: string | null;
}

/**
 * Whether a settled mutation still owns the selection it targeted — i.e. the
 * live selection is the SAME (org, language) pair the mutation captured when it
 * started. Only then is it safe to apply the mutation's local bookkeeping (or,
 * for delete, to clear the selection it removed).
 *
 * A `null` language is a legitimate target value (no selection) and compares
 * like any other: `stillOwnsSelection({org, language: null}, {org, language:
 * null})` is true.
 */
export function stillOwnsSelection(
  target: SelectionTarget,
  live: SelectionTarget
): boolean {
  return target.org === live.org && target.language === live.language;
}
