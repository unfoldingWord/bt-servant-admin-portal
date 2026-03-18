import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { fetchMe } from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";

const CHECK_COOLDOWN_MS = 30_000;

export function useSessionGuard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastCheckRef = useRef(0);

  const verify = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_COOLDOWN_MS) return;
    lastCheckRef.current = now;

    const storedUser = useAuthStore.getState().user;
    if (!storedUser) return;

    try {
      const serverUser = await fetchMe();

      if (!serverUser || serverUser.id !== storedUser.id) {
        queryClient.clear();
        useUiStore.getState().reset();
        useAuthStore.getState().setUser(null);
        void navigate("/login", { replace: true });
      }
    } catch {
      // Errors (network, 5xx, etc.) are ignored — don't kick the user out for transient failures
    }
  }, [navigate, queryClient]);

  useEffect(() => {
    const onFocus = () => void verify();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void verify();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [verify]);
}
