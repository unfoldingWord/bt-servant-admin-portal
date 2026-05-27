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
