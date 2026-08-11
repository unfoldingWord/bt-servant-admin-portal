// Display truncation, shared by every surface that renders untrusted
// third-party text in a bounded container (map nodes, server badges).
//
// It lives in its own module rather than alongside its first caller because
// both the map geometry and the server-attribution join need it, and those two
// now depend on each other — a shared primitive here is what keeps that
// dependency acyclic.

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
  const points = Array.from(text);
  if (points.length <= max) return text;
  return `${points
    .slice(0, Math.max(0, max - 1))
    .join("")
    .trimEnd()}…`;
}
