import {
  effectiveLanguageEditRights,
  hasAnyRights,
  type LanguageRightsCarrier,
} from "./permissions";

interface CrossOrgArgs {
  callerOrg: string;
  callerIsSuperAdmin: boolean;
  targetOrg: string | null;
}

// True when a super-admin is operating on an org other than their own
// home org. Org slugs are lowercase-normalized by the worker, but the
// create-user dialog's Org field is free-text, so we trim + lowercase
// both sides before comparing (rd-2 F8 + F15). A blank caller home org
// (shouldn't happen for a logged-in admin, but defends against a bad
// /me payload) must NOT read as "different from every target" and hand
// out the cross-org trump (rd-2 F14).
//
// Single source of truth: `canBootstrapLanguage` uses it for the
// permission decision, and the dialogs reuse it to word the CTA (so the
// two never diverge — rd-3 F1/F3).
export function isCrossOrgTarget({
  callerOrg,
  callerIsSuperAdmin,
  targetOrg,
}: CrossOrgArgs): boolean {
  if (!callerIsSuperAdmin) return false;
  const normalizedTargetOrg = targetOrg?.trim().toLowerCase() || null;
  const normalizedCallerOrg = callerOrg.trim().toLowerCase();
  return (
    normalizedTargetOrg !== null &&
    normalizedCallerOrg !== "" &&
    normalizedTargetOrg !== normalizedCallerOrg
  );
}

interface Args extends CrossOrgArgs {
  caller: LanguageRightsCarrier | null | undefined;
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
  if (isCrossOrgTarget({ callerOrg, callerIsSuperAdmin, targetOrg })) {
    return true;
  }
  return hasAnyRights(effectiveLanguageEditRights(caller));
}
