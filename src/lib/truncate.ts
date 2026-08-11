// Display truncation for SVG text, where the glyphs are painted at computed
// coordinates and CSS `text-overflow` cannot help. DOM surfaces bound their
// text with CSS instead, so they keep the full string as their text node (and
// therefore as their accessible name) — see lib/resource-servers.
//
// Cutting and measuring are deliberately NOT the same count:
//   - cutting is by CODE POINT, so a surrogate pair is never split in half;
//   - measuring is by COLUMN, because an emoji occupies roughly two Latin
//     columns of ink and budgeting it as one glyph overflows a fixed-width
//     node just as surely as budgeting a Latin letter as two undersizes one.

// Ranges that render at roughly double the advance width of a Latin glyph in
// the fonts these labels are painted in. This is East-Asian-width-lite: the
// wide/fullwidth blocks plus everything astral (emoji, historic scripts).
function isWide(code: number): boolean {
  return (
    // Everything outside the BMP: emoji, historic and rare scripts.
    code > 0xffff ||
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals … punctuation
    (code >= 0x3041 && code <= 0x33ff) || // Kana, Bopomofo, CJK compat
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Ext A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compat ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK compat forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/**
 * Approximate rendered width of `text` in Latin-character columns.
 *
 * A deliberate ESTIMATE for sizing SVG nodes, not typography: real advance
 * widths depend on the font and on kerning, and proportional Latin text varies
 * per glyph anyway. What it buys is that the two failure modes at the extremes
 * — counting an emoji as one column (text overflows its node) or as two
 * UTF-16 units' worth of anything else — stop being systematic.
 */
export function displayColumns(text: string): number {
  let columns = 0;
  for (const char of text) {
    columns += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return columns;
}

/**
 * Ellipsis-truncate `text` to at most `max` display columns, ellipsis included.
 *
 * The budget is in columns (see `displayColumns`) while the cut lands on a code
 * point boundary: slicing raw UTF-16 could bisect an astral character and emit
 * a lone surrogate, which renders as a replacement glyph and corrupts anything
 * that later re-encodes the label.
 *
 * For plain Latin text — every real subject label and nearly every server name
 * — columns and characters coincide, so this behaves exactly as a simple
 * character truncation would.
 *
 * Combining marks and ZWJ sequences can still be split; full grapheme
 * segmentation would be the fix and is deliberately not taken on here, because
 * the failure mode is a dropped accent or a de-joined emoji rather than the
 * malformed string a surrogate split produces.
 */
export function truncateLabel(text: string, max: number): string {
  if (displayColumns(text) <= max) return text;

  // The ellipsis itself costs one column.
  const budget = Math.max(0, max - 1);
  let columns = 0;
  let out = "";
  for (const char of text) {
    const width = isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
    if (columns + width > budget) break;
    columns += width;
    out += char;
  }
  return `${out.trimEnd()}…`;
}
