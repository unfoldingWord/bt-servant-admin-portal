import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuthStore } from "@/lib/auth-store";

// Gates a route on session.isAdmin === true. The worker enforces this on
// /api/admin/users regardless, but redirecting non-admins client-side
// avoids a useless 403 round-trip and a broken-looking page. RequireAuth
// (the parent gate) already handles the unauthenticated case.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
