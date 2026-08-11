// Display truncation for SVG text, where the glyphs are painted at computed
// coordinates and CSS `text-overflow` cannot help. DOM surfaces bound their
// text with CSS instead, so they keep the full string as their text node (and
// therefore as their accessible name) — see lib/resource-servers.
//
// Measuring and cutting must agree on what a "character" is, so both live here
// and both count code points.

/**
 * Length in code points rather than UTF-16 units.
 *
 * Every astral character (emoji, historic scripts) is two UTF-16 units but one
 * glyph, so `String.length` overstates its width — which matters both for
 * cutting a string and for estimating the ink it will occupy.
 */
export function codePointLength(text: string): number {
  let count = 0;
  // String iteration yields code points, not UTF-16 units — and counting this
  // way avoids materializing an array for what is usually a short label.
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // Skip the low half of a well-formed surrogate pair.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
    }
    count += 1;
  }
  return count;
}

/**
 * Ellipsis-truncate to at most `max` characters (including the ellipsis).
 *
 * The budget is counted in CODE POINTS, not UTF-16 units: slicing a raw string
 * at an arbitrary index can cut an astral character (emoji, historic scripts)
 * in half and emit a lone surrogate, which renders as a replacement glyph and
 * corrupts anything that later re-encodes the label. Counting code points also
 * makes the budget track rendered width more closely than UTF-16 units do.
 *
 * Combining marks and ZWJ sequences can still be split — a full grapheme
 * segmentation would be the fix, and is deliberately not taken on here: the
 * failure mode is a dropped accent or a de-joined emoji, not the malformed
 * string a surrogate split produces.
 */
export function truncateLabel(text: string, max: number): string {
  if (codePointLength(text) <= max) return text;
  const points = Array.from(text);
  return `${points
    .slice(0, Math.max(0, max - 1))
    .join("")
    .trimEnd()}…`;
}
