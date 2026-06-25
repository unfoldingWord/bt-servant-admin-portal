import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { hasAdminPowers, hasAnyModeAccess } from "@/lib/permissions";

// Gates `/modes` on admin OR any explicit mode verb-perm. Mirrors
// `RequireAdmin` in shape but loosens the predicate to match the
// post-#181 sidebar gate in activity-bar.tsx — non-admin mode
// shepherds need to reach the page so ModesPage can apply its
// per-row verb-perm gates (filter list, drop unauthorized selection,
// readOnly editor for publish-only users). Without this loosening,
// the sidebar Modes entry navigates to /modes and `RequireAdmin`
// bounces non-admins back to `/` before any page-level gating runs
// (Frank rd-3 review).
export function RequireModeAccess({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!hasAdminPowers(user) && !hasAnyModeAccess(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
