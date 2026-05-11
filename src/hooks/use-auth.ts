import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import * as authApi from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";

export function useAuth() {
  const { user, isLoading, setUser } = useAuthStore();
  const resetUi = useUiStore((s) => s.reset);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const login = useCallback(
    async (email: string, password: string) => {
      // Reset persisted UI selections (`selectedMode`, `selectedLanguage`,
      // etc.) on every login. Without this, a session-expiry → fresh-login on
      // the same tab carries the previous user's selections into the new
      // session, which is confusing at best and a privacy smell at worst.
      // `logout()` already resets but is not reached on cookie-expiry flows.
      resetUi();
      queryClient.clear();
      const authedUser = await authApi.login(email, password);
      setUser(authedUser);
      void navigate("/", { replace: true });
    },
    [queryClient, resetUi, setUser, navigate]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      resetUi();
      setUser(null);
      void navigate("/login", { replace: true });
    }
  }, [queryClient, resetUi, setUser, navigate]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };
}
