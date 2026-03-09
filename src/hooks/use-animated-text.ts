import { useEffect, useState } from "react";

const CHARS_PER_TICK = 4;
const TICK_MS = 16; // ~60fps

/**
 * Animates text character-by-character at ~60fps.
 * Ported from bt-servant-web-client's thread.tsx (PR #9).
 * Returns [displayedText, isAnimationComplete].
 */
export function useAnimatedText(
  text: string,
  charsPerTick: number = CHARS_PER_TICK
): [string, boolean] {
  const [displayedLength, setDisplayedLength] = useState(0);
  // Track previous text to detect resets
  const [prevText, setPrevText] = useState(text);

  // Detect text changes and adjust displayedLength (render-time check, not effect)
  if (text !== prevText) {
    setPrevText(text);
    if (text.length === 0) {
      setDisplayedLength(0);
    } else if (displayedLength > text.length) {
      setDisplayedLength(text.length);
    } else if (!text.startsWith(prevText.slice(0, displayedLength))) {
      setDisplayedLength(0);
    }
  }

  useEffect(() => {
    // Animate forward
    if (displayedLength < text.length) {
      const interval = setInterval(() => {
        setDisplayedLength((prev) =>
          Math.min(prev + charsPerTick, text.length)
        );
      }, TICK_MS);
      return () => clearInterval(interval);
    }
  }, [text.length, displayedLength, charsPerTick]);

  const isAnimationDone = displayedLength >= text.length;
  return [
    isAnimationDone ? text : text.slice(0, Math.max(0, displayedLength)),
    isAnimationDone,
  ];
}
