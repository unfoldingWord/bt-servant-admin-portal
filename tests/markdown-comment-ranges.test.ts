import { describe, expect, it } from "vitest";

import { findCommentRanges } from "../src/lib/markdown-comment-ranges";

// `findCommentRanges` powers the markdown editor's comment-decoration
// plugin. It returns dimming ranges for Ulysses-style notes (#77):
//   - `%%` line comments — single-line scope here (the editor's v1
//     approximation; backend stripping handles paragraph scope).
//   - `++ ... ++` paired inline spans.
//   - Fenced code blocks (``` or ~~~) suppress matching inside, the
//     same as `parseHeadings`'s contract.

describe("findCommentRanges — %% line comments", () => {
  it("matches a single %% line", () => {
    const text = "%% a note\nbody\n";
    expect(findCommentRanges(text)).toEqual([{ from: 0, to: 9 }]);
  });

  it("matches multiple %% lines independently", () => {
    const text = "%% first\nbody\n%% second\n";
    expect(findCommentRanges(text)).toEqual([
      { from: 0, to: 8 },
      { from: 14, to: 23 },
    ]);
  });

  it("does not match %% that is not at line start", () => {
    const text = "body %% inline percents\n";
    expect(findCommentRanges(text)).toEqual([]);
  });
});

describe("findCommentRanges — ++…++ spans", () => {
  it("matches a single inline span", () => {
    const text = "before ++note++ after";
    expect(findCommentRanges(text)).toEqual([{ from: 7, to: 15 }]);
  });

  it("matches multiple inline spans on the same line", () => {
    const text = "a ++one++ b ++two++ c";
    expect(findCommentRanges(text)).toEqual([
      { from: 2, to: 9 },
      { from: 12, to: 19 },
    ]);
  });

  it("matches multi-line ++ spans", () => {
    const text = "before ++note\nmore++ after";
    const ranges = findCommentRanges(text);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 7, to: 20 });
  });
});

describe("findCommentRanges — fenced code blocks", () => {
  it("ignores %% inside ``` fences", () => {
    const text = ["```", "%% looks like a comment but isn't", "```"].join("\n");
    expect(findCommentRanges(text)).toEqual([]);
  });

  it("ignores %% inside ~~~ fences", () => {
    const text = ["~~~", "%% same here", "~~~"].join("\n");
    expect(findCommentRanges(text)).toEqual([]);
  });

  it("ignores ++…++ inside fences", () => {
    const text = ["```", "x ++operator++ y", "```"].join("\n");
    expect(findCommentRanges(text)).toEqual([]);
  });

  it("matches %% outside fences while ignoring inside ones", () => {
    const text = [
      "%% real comment",
      "```",
      "%% fake comment",
      "```",
      "%% another real comment",
    ].join("\n");
    const ranges = findCommentRanges(text);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.from).toBe(0);
    // Second real comment lives after the fence; we just check the
    // markers come from outside-fence lines.
    expect(text.slice(ranges[1]!.from, ranges[1]!.to)).toBe(
      "%% another real comment"
    );
  });

  it("treats an unclosed fence as fenced through end-of-document", () => {
    const text = ["```", "%% inside the unclosed fence"].join("\n");
    expect(findCommentRanges(text)).toEqual([]);
  });
});

describe("findCommentRanges — ordering", () => {
  it("returns ranges sorted by `from`", () => {
    const text = "%% a\n++ b ++ ++ c ++\n%% d\n";
    const ranges = findCommentRanges(text);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.from).toBeGreaterThanOrEqual(ranges[i - 1]!.from);
    }
    // Sanity: still finds all four markers.
    expect(ranges).toHaveLength(4);
  });
});
