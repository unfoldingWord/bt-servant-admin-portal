// Where a language mutation's failure is allowed to appear, and in whose
// words (#286 review). Two rules, both pure so they can be pinned by
// tests instead of by inspection of a component tree.
//
// Rule 1 — ONE surface per failure. The delete dialog stays open on
// rejection and renders the message inline (#102), so any error a dialog
// owns must not ALSO reach the page banner: while the failure is current
// the second copy is redundant, and after the user fixes it the banner
// keeps asserting a block that no longer exists. (modes.tsx applies the
// same policy to its clone/retire dialogs.)
//
// Rule 2 — copy that PRESCRIBES an action depends on who is reading. The
// API layer knows the error class; only the UI knows whether this viewer
// holds the rights the recovery needs.

import {
  LanguageForbiddenError,
  LanguageIsDefaultError,
} from "@/lib/languages-api";

// True when a delete was refused because the language is (or may be) the
// org default. The page uses this to drop a stale 409 once the admin
// changes or clears the default — the very action that unblocks it.
export function isDefaultBlockedDeleteError(error: unknown): boolean {
  return error instanceof LanguageIsDefaultError;
}

// The error the page-level "Save failed:" banner should render, or null.
// Forbidden errors have their own dedicated banner; the org-default 409
// belongs to the delete dialog alone.
export function selectLanguageMutationBanner(
  saveError: unknown,
  deleteError: unknown
): Error | null {
  if (
    saveError instanceof Error &&
    !(saveError instanceof LanguageForbiddenError)
  ) {
    return saveError;
  }
  if (
    deleteError instanceof Error &&
    !(deleteError instanceof LanguageForbiddenError) &&
    !isDefaultBlockedDeleteError(deleteError)
  ) {
    return deleteError;
  }
  return null;
}

// Copy for a failed language DELETE. Per-row edit+publish rights are
// enough to delete a language, but changing the org default is admin-only
// — so a shepherd can reach this 409 and be unable to perform the recovery
// the admin copy prescribes.
export function describeLanguageDeleteError(
  error: unknown,
  canSetDefault: boolean
): string {
  if (error instanceof LanguageIsDefaultError) {
    return canSetDefault
      ? `"${error.languageName}" can't be deleted right now — it may be this org's default language. Set a different default, or clear it, then try again.`
      : `"${error.languageName}" can't be deleted right now — it may be this org's default language. Ask an admin to change or clear the default, then try again.`;
  }
  return error instanceof Error ? error.message : "Failed to delete language.";
}
