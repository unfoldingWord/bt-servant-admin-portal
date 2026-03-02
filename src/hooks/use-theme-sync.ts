import { useEffect } from "react";

import { useThemeStore } from "@/lib/theme-store";

export function useThemeSync() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);
}
