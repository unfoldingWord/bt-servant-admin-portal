import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
