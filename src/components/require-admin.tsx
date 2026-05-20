import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { hasAdminPowers } from "@/lib/permissions";

// Gates a route on org admin OR super admin. The worker enforces this on
// /api/admin/users regardless, but redirecting non-admins client-side
// avoids a useless 403 round-trip and a broken-looking page. RequireAuth
// (the parent gate) already handles the unauthenticated case.
//
// Super admins pass even when isAdmin is false (mirrors worker's "super
// trumps" rule). Without this, a super admin who self-demoted isAdmin
// would be redirected away from /admin/users despite the worker letting
// them in.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!hasAdminPowers(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
