import type { LanguageRights } from "@/types/auth";

import { effectiveLanguageEditRights, hasAnyRights } from "./permissions";

interface CallerRights {
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  language_rights?: LanguageRights;
}

interface Args {
  caller: CallerRights | null | undefined;
  callerOrg: string;
  callerIsSuperAdmin: boolean;
  targetOrg: string | null;
}

// #247: true when the caller can create the FIRST language draft in
// `targetOrg`. Mirrors the Languages page's `canCreate` gate:
//   - Cross-org super-admin: bypasses per-row rights via worker's PR A
//     carve-out (#166).
//   - Everyone else (home-org, or same-org super-admin): needs some
//     effective `language_edit_rights` — undefined counts as legacy
//     full access, [] doesn't.
export function canBootstrapLanguage({
  caller,
  callerOrg,
  callerIsSuperAdmin,
  targetOrg,
}: Args): boolean {
  // Anonymous callers would never open the dialog in practice
  // (auth-store guards upstream), but the gate should still be safe
  // to compose without relying on that guard. hasAnyRights(undefined)
  // returns true for legacy back-compat, so an explicit null guard
  // is needed here — the intent is "caller has some grant," not "no
  // caller is treated as legacy full access."
  if (!caller) return false;
  // Case-insensitive comparison: org slugs are lowercase-normalized
  // by the worker, but the create-user dialog's Org field is free-text.
  // A super-admin who types "Acme" (accidental capitalization) when
  // their home org is "acme" would otherwise satisfy the cross-org
  // branch and get an unearned trump on same-org bootstrap.
  const normalizedTargetOrg = targetOrg?.toLowerCase() ?? null;
  const normalizedCallerOrg = callerOrg.toLowerCase();
  const isCrossOrgTarget =
    callerIsSuperAdmin &&
    normalizedTargetOrg !== null &&
    normalizedTargetOrg !== normalizedCallerOrg;
  if (isCrossOrgTarget) return true;
  return hasAnyRights(effectiveLanguageEditRights(caller));
}
