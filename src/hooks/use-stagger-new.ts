import { useEffect, useRef, useState } from "react";

// Returns the subset of `items` that have appeared since the hook's first
// render — useful for staggering the entry animation of newly-added list
// entries without re-animating items that already existed. Items that
// disappear are not re-animated if they reappear later (kept in seenRef).
export function useStaggerNew(items: ReadonlyArray<string>): Set<string> {
  const seen = useRef<Set<string>>(new Set());
  const [animated, setAnimated] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh: string[] = [];
    for (const slug of items) {
      if (!seen.current.has(slug)) {
        seen.current.add(slug);
        fresh.push(slug);
      }
    }
    if (fresh.length > 0) {
      setAnimated((prev) => {
        const next = new Set(prev);
        for (const s of fresh) next.add(s);
        return next;
      });
    }
  }, [items]);

  return animated;
}
