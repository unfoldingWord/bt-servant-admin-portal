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

/**
 * What a settled mutation callback should do with its local bookkeeping.
 *
 *   - "apply"  — stamp the captured result onto the editor's locals as usual.
 *   - "skip"   — do nothing; the selection moved to a DIFFERENT (org, language)
 *                pair, so this row's locals are none of our business.
 *   - "resync" — the pair still matches, but the editor's locals were
 *                re-anchored to the reloaded cache while this PUT was in flight
 *                (a leave-and-return during the save). Stamping the value we
 *                captured would either revert the save or, worse, leave locals
 *                stale relative to the row we just wrote — the next autosave
 *                then PUTs the stale document/flag back over the good save
 *                (#307). Instead, force the editor to reload from the
 *                authoritative post-PUT cache row.
 */
export type MutationSettleAction = "apply" | "skip" | "resync";

/**
 * A single (org, language) pair-match is NOT enough to safely stamp a settled
 * mutation, because the product lets the user leave a language and return to it
 * while a save is in flight. On the return, the sync effect re-anchors the
 * editor's locals to the reloaded (pre-save) cache — yet the pair matches
 * again, so a pair-only gate would stamp the captured (now stale) result and
 * the next autosave would revert the save (#307, the class `stillOwnsSelection`
 * cannot see).
 *
 * A generation counter — bumped ONLY where the locals are actually re-anchored
 * (the sync effect's reset and re-anchor branches), captured by each mutation
 * at call time — closes it: an unchanged generation proves the locals never
 * moved out from under the mutation, so the stamp is safe; a moved generation
 * on a still-matching pair means a re-anchor happened and the caller must
 * reload from cache rather than stamp.
 *
 * NB: the generation is bumped on the re-anchor, not on selection identity. A
 * first attempt that bumped it on every (org, language) change was reverted
 * (`b3b759d` → `9a10b51`) because the sync effect often does NOT re-anchor on a
 * selection change (a warm-cache return early-returns), so the generation moved
 * while the locals stayed put — false "resync" that staled `lastSyncedPublished`
 * and reverted the very toggle it meant to protect.
 */
export function classifyMutationSettle(
  target: SelectionTarget,
  live: SelectionTarget,
  capturedGen: number,
  liveGen: number
): MutationSettleAction {
  if (!stillOwnsSelection(target, live)) return "skip";
  return capturedGen === liveGen ? "apply" : "resync";
}

/** The authoritative post-PUT row a mutation just wrote to the server. */
export interface SavedRow {
  document: string;
  published: boolean;
  label: string | undefined;
}

/** How to reconcile the editor's locals after a "resync" (see `reconcileReanchor`). */
export interface ReanchorReconcile {
  /**
   * The document to install as the new `draft`, or `null` to KEEP the current
   * draft. It is `null` exactly when the user edited the re-anchored document
   * after returning: their newer text is preserved and the next autosave
   * flushes it (user-wins). It is the saved document when the draft was
   * untouched since the re-anchor — the pure leave-and-return that #307 fixes,
   * where the editor should show what was actually saved.
   */
  nextDraft: string | null;
  nextSyncedDoc: string;
  nextPublished: boolean;
  nextLabel: string | undefined;
}

/**
 * Decide how to reconcile the editor's locals when a successful mutation
 * settles onto a selection whose locals were re-anchored while the PUT was in
 * flight (a "resync" — pair still matches, generation moved).
 *
 * The synced BASELINE (doc/published/label) always advances to what was
 * actually saved, so the next autosave cannot revert it — this is what closes
 * the silent doc-revert and publish-revert of #307. The DRAFT is only reloaded
 * when the user has NOT edited since the re-anchor (`currentDraft ===
 * currentSyncedDoc`); if they typed after returning, their draft is kept so the
 * edit is not silently discarded (codex P1 / grok P2). Applying this in the
 * settle callback — rather than bouncing through the sync effect — is also what
 * prevents a same-commit autosave from PUTting the pre-reconcile draft over the
 * save (grok P2).
 */
export function reconcileReanchor(
  currentDraft: string,
  currentSyncedDoc: string,
  saved: SavedRow
): ReanchorReconcile {
  const draftUntouched = currentDraft === currentSyncedDoc;
  return {
    nextDraft: draftUntouched ? saved.document : null,
    nextSyncedDoc: saved.document,
    nextPublished: saved.published,
    nextLabel: saved.label,
  };
}
