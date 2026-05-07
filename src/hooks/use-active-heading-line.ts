import { useEffect, useState, type RefObject } from "react";

import type { MarkdownHeading } from "@/types/markdown";

// Tracks which heading the textarea cursor currently sits in (or below).
// Returns the line index of the active heading, or -1 if the cursor is
// above the first heading.
export function useActiveHeadingLine(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  headings: MarkdownHeading[]
): number {
  const [activeLine, setActiveLine] = useState(-1);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    function update() {
      if (!ta) return;
      const pos = ta.selectionStart ?? 0;
      let line = 0;
      for (let i = 0; i < pos; i++) {
        if (value.charCodeAt(i) === 10) line += 1;
      }
      let active = -1;
      for (const h of headings) {
        if (h.line <= line) active = h.line;
        else break;
      }
      setActiveLine(active);
    }

    update();
    ta.addEventListener("keyup", update);
    ta.addEventListener("click", update);
    ta.addEventListener("focus", update);
    return () => {
      ta.removeEventListener("keyup", update);
      ta.removeEventListener("click", update);
      ta.removeEventListener("focus", update);
    };
  }, [textareaRef, value, headings]);

  return activeLine;
}
