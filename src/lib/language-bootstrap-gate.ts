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
  // Case-insensitive + trimmed comparison: org slugs are lowercase-
  // normalized by the worker, but the create-user dialog's Org field is
  // free-text. A super-admin who types "Acme" or "acme " (stray case /
  // whitespace) when their home org is "acme" would otherwise satisfy
  // the cross-org branch and get an unearned trump on same-org
  // bootstrap (rd-2 F8 + F15).
  const normalizedTargetOrg = targetOrg?.trim().toLowerCase() || null;
  const normalizedCallerOrg = callerOrg.trim().toLowerCase();
  const isCrossOrgTarget =
    callerIsSuperAdmin &&
    normalizedTargetOrg !== null &&
    // Require a known caller home org before granting the cross-org
    // trump. An empty callerOrg (shouldn't happen for a logged-in
    // admin, but defends against a bad /me payload) must NOT read as
    // "different from every target" and hand out access (rd-2 F14).
    normalizedCallerOrg !== "" &&
    normalizedTargetOrg !== normalizedCallerOrg;
  if (isCrossOrgTarget) return true;
  return hasAnyRights(effectiveLanguageEditRights(caller));
}
