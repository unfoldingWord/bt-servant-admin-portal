import { useCallback } from "react";
import { useNavigate } from "react-router";

import * as authApi from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";

export function useAuth() {
  const { user, isLoading, setUser } = useAuthStore();
  const resetUi = useUiStore((s) => s.reset);
  const navigate = useNavigate();

  const login = useCallback(
    async (email: string, password: string) => {
      const authedUser = await authApi.login(email, password);
      setUser(authedUser);
      void navigate("/", { replace: true });
    },
    [setUser, navigate]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      resetUi();
      setUser(null);
      void navigate("/login", { replace: true });
    }
  }, [resetUi, setUser, navigate]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };
}
