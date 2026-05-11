import { describe, expect, it } from "vitest";

import { parseHeadings } from "../src/lib/markdown-headings";

// `parseHeadings` is a state-machine parser shared by the modes + languages
// markdown editors (from #75 / PR #85). Behavior pinned here:
//   - ATX H1/H2/H3 only; H4-H6 and setext styles ignored.
//   - Fenced code blocks (``` and ~~~) suppress headings inside.
//   - Ulysses-style `%%` paragraph comments and `++…++` inline spans
//     suppress / strip heading content per the syntax in #77 (Tim Jore /
//     help.ulysses.app).
//   - Duplicate slugs get `-N` suffixes; symbol-only headings fall back
//     to `section`.

describe("parseHeadings — basic ATX headings", () => {
  it("parses H1/H2/H3 at the correct levels with line numbers", () => {
    const doc = ["# Top", "", "## Section", "", "### Subsection"].join("\n");
    expect(parseHeadings(doc)).toEqual([
      { level: 1, text: "Top", slug: "top", line: 0 },
      { level: 2, text: "Section", slug: "section", line: 2 },
      { level: 3, text: "Subsection", slug: "subsection", line: 4 },
    ]);
  });

  it("ignores H4–H6 (regex caps at three hashes)", () => {
    const doc = ["#### Four", "##### Five", "###### Six"].join("\n");
    expect(parseHeadings(doc)).toEqual([]);
  });

  it("ignores setext (===, ---) underline-style headings", () => {
    const doc = ["Top", "====", "", "Sub", "----"].join("\n");
    expect(parseHeadings(doc)).toEqual([]);
  });

  it("strips trailing closing hashes (`## Title ##` → `Title`)", () => {
    expect(parseHeadings("## Title ##")).toEqual([
      { level: 2, text: "Title", slug: "title", line: 0 },
    ]);
  });

  it("skips a heading with only whitespace as body", () => {
    expect(parseHeadings("##   ")).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    const doc = "# A\r\n\r\n## B";
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["A", "B"]);
  });
});

describe("parseHeadings — fenced code blocks", () => {
  it("ignores ATX headings inside ``` fences", () => {
    const doc = [
      "## Before",
      "```",
      "## not a heading",
      "### nope",
      "```",
      "## After",
    ].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["Before", "After"]);
  });

  it("ignores ATX headings inside ~~~ fences", () => {
    const doc = [
      "## Before",
      "~~~",
      "## not a heading",
      "~~~",
      "## After",
    ].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["Before", "After"]);
  });

  it("requires a matching closing fence — unclosed fence swallows the rest", () => {
    const doc = ["## Before", "```", "## inside", "## still inside"].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["Before"]);
  });
});

describe("parseHeadings — `%%` paragraph comments", () => {
  it("suppresses an ATX heading on a `%%`-prefixed line", () => {
    expect(parseHeadings("%% ## not a real heading")).toEqual([]);
  });

  it("suppresses headings within a `%%` paragraph until blank line", () => {
    const doc = [
      "%% start of comment",
      "## still in comment",
      "more comment",
      "",
      "## After blank line",
    ].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["After blank line"]);
  });

  it("a `%%` mid-paragraph (not at start) does not start a comment block", () => {
    const doc = ["lead-in text %% mid-line", "## After"].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["After"]);
  });
});

describe("parseHeadings — `++…++` inline spans", () => {
  it("strips inline `++…++` content from heading text", () => {
    expect(parseHeadings("## Title ++hidden++ visible")).toEqual([
      { level: 2, text: "Title visible", slug: "title-visible", line: 0 },
    ]);
  });

  it("suppresses headings inside a multi-line `++…++` span", () => {
    const doc = [
      "start ++span open",
      "## suppressed",
      "span close++",
      "## After",
    ].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["After"]);
  });

  it("two `++` tokens on the same line toggle paired and back (heading emits)", () => {
    expect(parseHeadings("## A ++stripped++ B")).toEqual([
      { level: 2, text: "A B", slug: "a-b", line: 0 },
    ]);
  });
});

describe("parseHeadings — slug uniqueness + fallback", () => {
  it("appends -2, -3 to duplicate slugs in document order", () => {
    const doc = ["## Section", "", "## Section", "", "## Section"].join("\n");
    expect(parseHeadings(doc).map((h) => h.slug)).toEqual([
      "section",
      "section-2",
      "section-3",
    ]);
  });

  it("symbol-only heading text falls back to slug 'section'", () => {
    // After punctuation→hyphen and stripping leading/trailing hyphens, the
    // result is empty — `slugify` falls back to "section". The unique-counter
    // still increments off "section" so a real `## Section` later collides
    // intentionally.
    expect(parseHeadings("## ???")).toEqual([
      { level: 2, text: "???", slug: "section", line: 0 },
    ]);
  });

  it("lowercases and hyphenates the slug", () => {
    expect(parseHeadings("## My Cool Heading!")).toEqual([
      { level: 2, text: "My Cool Heading!", slug: "my-cool-heading", line: 0 },
    ]);
  });
});

describe("parseHeadings — combined / regression", () => {
  it("ignores comment + fence + span in one document", () => {
    const doc = [
      "# Title", // 0 → emit
      "",
      "%% commented", // 2 → comment block
      "## inside-comment", // 3 → suppressed
      "",
      "## After-comment", // 5 → emit
      "```", // 6 → fence open
      "## inside-fence", // 7 → suppressed
      "```", // 8 → fence close
      "++span", // 9 → span open
      "## inside-span", // 10 → suppressed
      "span++", // 11 → span close
      "## End", // 12 → emit
    ].join("\n");
    expect(
      parseHeadings(doc).map((h) => ({ text: h.text, line: h.line }))
    ).toEqual([
      { text: "Title", line: 0 },
      { text: "After-comment", line: 5 },
      { text: "End", line: 12 },
    ]);
  });
});
