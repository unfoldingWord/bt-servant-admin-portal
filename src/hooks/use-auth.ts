import { useCallback } from "react";
import { useNavigate } from "react-router";

import * as authApi from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";

export function useAuth() {
  const { user, isLoading, setUser } = useAuthStore();
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
    await authApi.logout();
    setUser(null);
    void navigate("/login", { replace: true });
  }, [setUser, navigate]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };
}
