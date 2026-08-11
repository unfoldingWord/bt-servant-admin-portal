// The autosave gate for the mode editor, lifted out of the page so it can be
// stated once and tested directly (same shape as `context-org-guard` and
// `language-bootstrap-gate`).
//
// The condition that forced the extraction is the LAG check. Autosave writes a
// DEBOUNCED snapshot of the draft, and a debounced value is by definition a
// value from the past. Every other way the draft changes is a keystroke, where
// being ~800ms behind is the entire point — but the page also changes the
// draft out of band, wholesale, and then saves it immediately: the resource-
// priority panel's Apply does exactly that. In that window the page has
// already persisted the NEW document and advanced `lastSyncedDoc` to it, while
// `debouncedDraft` still holds the OLD one. The old value then differs from
// `lastSyncedDoc`, which is all the naive gate ever asked, so autosave writes
// the pre-apply document back over the applied one:
//
//   1. Apply: draft := B, PUT B, lastSyncedDoc := B.
//   2. The in-flight save clears before the debounce elapses.
//   3. Autosave sees debouncedDraft (A) !== lastSyncedDoc (B) → PUT A.
//
// The server ends up on A, `lastSyncedDoc` follows it back to A while the
// draft still shows B, and the page reports itself dirty immediately after a
// SUCCESSFUL save. Discarding at the next mode switch then reloads A, and the
// applied change is gone without an error anywhere.
//
// The fix is to notice that a debounced value which has not caught up to the
// draft is not a save candidate at all. In the ordinary typing case the two
// converge as soon as the user pauses, so steady-state autosave is unaffected;
// only stale snapshots are refused.

export interface AutoSaveGateInput {
  /** The mode being edited, or `null` when the page has no selection. */
  selectedMode: string | null;
  /** A save is already in flight. */
  isSaving: boolean;
  /** The live draft — the newest text there is. */
  draft: string;
  /** The debounced snapshot autosave is proposing to write. */
  debouncedDraft: string;
  /** What the server is known to hold for this mode. */
  lastSyncedDoc: string;
  /**
   * A document whose save already failed. Retrying it unprompted loops on
   * every `isPending` → `false` transition; the user re-arms it by editing
   * further or by saving manually.
   */
  lastFailedDoc: string | null;
  /** Whether the current user may edit this mode at all. */
  canEdit: boolean;
}

/**
 * Whether the autosave effect should write `debouncedDraft` right now.
 *
 * Ordered cheapest-first, and every clause is a refusal — the default is not
 * to save.
 */
export function shouldAutoSaveDraft(input: AutoSaveGateInput): boolean {
  if (input.selectedMode === null) return false;
  if (input.isSaving) return false;
  if (!input.canEdit) return false;
  // A lagging debounce describes a document that has already been superseded.
  // Writing it would undo whatever superseded it.
  if (input.debouncedDraft !== input.draft) return false;
  if (input.debouncedDraft === input.lastSyncedDoc) return false;
  if (input.debouncedDraft === input.lastFailedDoc) return false;
  return true;
}
