import { useEffect } from "react";

import { fetchMe } from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const user = await fetchMe();
        if (!cancelled) {
          setUser(user);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [setUser, setLoading]);
}
