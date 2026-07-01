import { useAuthStore } from "@/lib/auth-store";
import {
  canBootstrapLanguage,
  isCrossOrgTarget,
} from "@/lib/language-bootstrap-gate";
import { useLanguages } from "@/hooks/use-languages";

interface Args {
  // The caller's home org (create dialog: the `callerOrg` prop; edit
  // dialog: the logged-in user's own org).
  callerOrg: string;
  callerIsSuperAdmin: boolean;
  // The org the dialog is scoping rights against, or null when unknown
  // (e.g. a super-admin cleared the Org field).
  targetOrg: string | null;
}

interface Result {
  // Show the #247 empty-drafts CTA: the target org is known, has zero
  // language drafts, and the caller can create one there.
  showBootstrap: boolean;
  // The caller is a super-admin acting on an org other than their home
  // org. Drives the CTA copy (a fresh Languages tab boots in home
  // context). Reuses the gate's normalized comparison.
  isCrossOrg: boolean;
}

// #247: single source for the empty-drafts CTA gate, shared by the
// create + edit user dialogs so the show/hide rule and cross-org
// determination can't drift between the two surfaces (rd-4 F3). The
// internal `useLanguages(targetOrg)` shares React Query's cache with the
// dialog's own list query (same key), so this adds no extra fetch.
export function useLanguageBootstrapGate({
  callerOrg,
  callerIsSuperAdmin,
  targetOrg,
}: Args): Result {
  const callerUser = useAuthStore((s) => s.user);
  const languagesQuery = useLanguages(targetOrg);

  const canBootstrap = canBootstrapLanguage({
    caller: callerUser,
    callerOrg,
    callerIsSuperAdmin,
    targetOrg,
  });
  // `?.` on `languages` too: a contract-violating payload missing the
  // array (e.g. a partial worker response) degrades to the empty-state
  // path instead of throwing a TypeError that would blank the dialog
  // (rd-5 F1).
  const targetOrgHasNoLanguages =
    languagesQuery.isSuccess &&
    (languagesQuery.data?.languages?.length ?? 0) === 0;

  return {
    showBootstrap:
      targetOrg !== null && targetOrgHasNoLanguages && canBootstrap,
    isCrossOrg: isCrossOrgTarget({ callerOrg, callerIsSuperAdmin, targetOrg }),
  };
}
