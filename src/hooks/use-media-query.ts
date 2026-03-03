import { useEffect, useState } from "react";

// SPA-only: the typeof window guard prevents errors if this file is ever
// imported in a non-browser context, but it would cause a hydration mismatch
// under SSR. Acceptable since this project is a Vite client-side SPA.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
