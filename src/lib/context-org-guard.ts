// Decision helper for the org-context dirty-guard wired into Modes and
// Languages pages. Without this guard a super-admin half a sentence into
// an edit would silently lose it when the OrgContextSelector dropdown
// fired (Frank P1, PR #186 review).
//
// Pure function so the contract is testable without a React renderer —
// the repo doesn't yet have RTL set up, and the existing pendingSwitch
// (per-mode/language) pattern has no equivalent coverage either, so this
// helper exists primarily to pin the rule. Pages branch on the return
// value: `no-op` exits early, `apply` calls setContextOrg directly,
// `confirm` opens an AlertDialog and stashes the pending value.

export type ContextChangeOutcome = "no-op" | "apply" | "confirm";

export function decideContextChange(
  current: string | null,
  next: string | null,
  isDirty: boolean,
  isSaving: boolean
): ContextChangeOutcome {
  if (next === current) return "no-op";
  if (isDirty || isSaving) return "confirm";
  return "apply";
}

// Why the confirmation opened. #286 widened the guard to cover in-flight
// org-scoped writes (a set/clear of the org default, a delete), which are
// NOT "unsaved edits" — telling a user their typing is at risk when they
// haven't typed anything is a false alarm that teaches them to click
// through the dialog. The page picks its copy from this.
export type ContextSwitchReason = "dirty" | "pending-write" | "both";

export function contextSwitchReason(
  isDirty: boolean,
  hasPendingWrite: boolean
): ContextSwitchReason {
  if (isDirty && hasPendingWrite) return "both";
  return isDirty ? "dirty" : "pending-write";
}
