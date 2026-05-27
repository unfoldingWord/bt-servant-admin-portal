import { useMemo } from "react";

import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";
import { useAdminUsers } from "@/hooks/use-admin-users";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select disallows empty-string values. The store holds `null` to
// signal "my home org" but the Select needs a non-empty placeholder; this
// sentinel bridges that gap (mirrors `ORG_FILTER_ALL_SENTINEL` in
// `src/lib/admin-users-api.ts`). The namespaced bracketing makes the value
// collision-proof against any real org slug.
export const HOME_ORG_SENTINEL = "@@bt-servant:home-org@@";

interface OrgContextSelectorProps {
  // Optional intercept hook. When provided, the selector hands the chosen
  // value to the parent instead of mutating the store directly. Pages
  // with an unsaved-draft state (Modes, Languages) wire this to a
  // dirty-guard handler so a context switch goes through the same
  // confirmation flow as the per-page selectors. Pages without a draft
  // (Prompt Overrides — each slot saves immediately) leave the prop
  // undefined and accept the default direct-set behavior.
  //
  // Without this hook the selector would silently call setContextOrg →
  // store clears selectedMode/selectedLanguage → page's useEffect resets
  // the draft to "". A super-admin half a sentence into an edit would
  // lose it with no confirmation (Frank P1, PR #186 review).
  onRequestChange?: (next: string | null) => void;
}

// Cross-org context picker for super admins. Renders the home org as the
// default selection plus every other org that has at least one user. List
// derived from `useAdminUsers` because (a) it's already cross-org for super
// admins and (b) orgs are created implicitly via user creation per
// `[[per_org_config_scoping]]` — there's no standalone org registry to
// query. An org with zero users is unreachable here, which matches the
// system invariant.
//
// Renders nothing for non-super-admin sessions. The store value persists
// across navigation between Modes / Languages / Prompt-Overrides so a
// super-admin investigating one org sees consistent context across the
// three pages.
export function OrgContextSelector({
  onRequestChange,
}: OrgContextSelectorProps = {}) {
  const callerOrg = useAuthStore((s) => s.user?.org ?? "");
  const callerIsSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);
  const contextOrg = useUiStore((s) => s.contextOrg);
  const setContextOrg = useUiStore((s) => s.setContextOrg);

  // Only fetch when the user can actually use the override. Avoids a
  // wasted /api/admin/users call for org admins (who'd get a same-org
  // list back anyway and have no use for it here).
  const usersQuery = useAdminUsers(callerIsSuperAdmin);

  const otherOrgs = useMemo(() => {
    if (!usersQuery.data) return [];
    const distinct = Array.from(new Set(usersQuery.data.map((u) => u.org)));
    return distinct.filter((o) => o !== callerOrg).sort();
  }, [usersQuery.data, callerOrg]);

  if (!callerIsSuperAdmin) return null;

  const selectValue = contextOrg ?? HOME_ORG_SENTINEL;

  const handleChange = (value: string) => {
    const next =
      value === HOME_ORG_SENTINEL || value === callerOrg ? null : value;
    if (onRequestChange) {
      onRequestChange(next);
      return;
    }
    setContextOrg(next);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Org context</span>
      <Select value={selectValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[220px]" data-testid="org-context-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={HOME_ORG_SENTINEL}>
            Your org ({callerOrg})
          </SelectItem>
          {otherOrgs.map((org) => (
            <SelectItem key={org} value={org}>
              {org}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
