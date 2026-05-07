import type { MarkdownHeading, MarkdownHeadingLevel } from "@/types/markdown";

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(?:```|~~~)/;
const BLANK_LINE_RE = /^\s*$/;
const PARAGRAPH_COMMENT_PREFIX = "%%";
const SPAN_TOKEN = "++";
const INLINE_SPAN_RE = /\+\+[\s\S]*?\+\+/g;

// Parses ATX headings (`#`, `##`, `###`) from a markdown document, ignoring
// content inside Ulysses-style comments (per #77, Markdown XL):
//   - `%%` at the start of a paragraph marks the whole paragraph as a comment
//     (extends to the next blank line). Source: help.ulysses.app/en_US/comments-notes-annotations.
//   - `++ ... ++` is a paired inline span comment.
// Setext headings, indented headings, and fenced-code-block contents are ignored.
export function parseHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;
  let inSpan = false;
  let inCommentParagraph = false;
  let atParagraphStart = true;

  for (const [i, line] of lines.entries()) {
    if (BLANK_LINE_RE.test(line)) {
      inCommentParagraph = false;
      atParagraphStart = true;
      continue;
    }

    if (
      atParagraphStart &&
      !inSpan &&
      line.startsWith(PARAGRAPH_COMMENT_PREFIX)
    ) {
      inCommentParagraph = true;
    }
    atParagraphStart = false;

    if (!inSpan && FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    if (!inSpan && !inCommentParagraph) {
      const match = HEADING_RE.exec(line);
      if (match) {
        const [, hashes = "", body = ""] = match;
        const level = hashes.length as MarkdownHeadingLevel;
        const text = stripInlineSpans(body).trim();
        if (text) {
          headings.push({
            level,
            text,
            slug: makeUniqueSlug(text, slugCounts),
            line: i,
          });
        }
      }
    }

    if (!inCommentParagraph && countOccurrences(line, SPAN_TOKEN) % 2 === 1) {
      inSpan = !inSpan;
    }
  }

  return headings;
}

function stripInlineSpans(text: string): string {
  return text.replace(INLINE_SPAN_RE, "").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + needle.length;
  }
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function makeUniqueSlug(text: string, counts: Map<string, number>): string {
  const base = slugify(text);
  const seen = counts.get(base) ?? 0;
  counts.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}
