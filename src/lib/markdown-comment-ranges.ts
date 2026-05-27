// Pure helper for the editor's comment-decoration plugin. Identifies
// Ulysses-style comment ranges in a markdown document so they can be
// dimmed in the editor. Mirrors `src/lib/markdown-headings.ts`'s
// fence-tracking so `%%` and `++…++` inside fenced code blocks (which
// are literal content, not editor-only notes) are left alone.

const COMMENT_LINE_RE = /^%%.*/gm;
const COMMENT_SPAN_RE = /\+\+[\s\S]*?\+\+/g;
const FENCE_RE = /^(?:```|~~~)/;

export interface CommentRange {
  from: number;
  to: number;
}

function fenceRanges(text: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let inFence = false;
  let fenceStart = 0;
  let pos = 0;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line)) {
      if (inFence) {
        ranges.push({ from: fenceStart, to: pos + line.length });
        inFence = false;
      } else {
        fenceStart = pos;
        inFence = true;
      }
    }
    pos += line.length + 1;
  }
  if (inFence) ranges.push({ from: fenceStart, to: text.length });
  return ranges;
}

function isInsideAny(idx: number, ranges: CommentRange[]): boolean {
  for (const r of ranges) {
    if (idx >= r.from && idx < r.to) return true;
    if (r.from > idx) return false;
  }
  return false;
}

export function findCommentRanges(text: string): CommentRange[] {
  const fences = fenceRanges(text);
  const out: CommentRange[] = [];
  let m: RegExpExecArray | null;
  COMMENT_LINE_RE.lastIndex = 0;
  while ((m = COMMENT_LINE_RE.exec(text)) !== null) {
    if (!isInsideAny(m.index, fences)) {
      out.push({ from: m.index, to: m.index + m[0].length });
    }
  }
  COMMENT_SPAN_RE.lastIndex = 0;
  while ((m = COMMENT_SPAN_RE.exec(text)) !== null) {
    if (!isInsideAny(m.index, fences)) {
      out.push({ from: m.index, to: m.index + m[0].length });
    }
  }
  out.sort((a, b) => a.from - b.from);
  return out;
}
