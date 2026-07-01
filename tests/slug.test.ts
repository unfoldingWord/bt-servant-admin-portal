import { describe, expect, it } from "vitest";

import { slugify } from "../src/lib/slug";

// Locks in the parity with the pre-existing inline slugify pipelines in
// mode-selector.tsx and language-selector.tsx — any change to the rule
// has to update all three call sites together.

describe("slugify", () => {
  it("passes through canonical slugs unchanged", () => {
    expect(slugify("indonesian")).toBe("indonesian");
    expect(slugify("fia-drafting")).toBe("fia-drafting");
    expect(slugify("my_mode_1")).toBe("my_mode_1");
  });

  it("lowercases", () => {
    expect(slugify("Indonesian")).toBe("indonesian");
    expect(slugify("FIA-Drafting")).toBe("fia-drafting");
  });

  it("trims outer whitespace", () => {
    expect(slugify("  indonesian  ")).toBe("indonesian");
    expect(slugify("\tindonesian\n")).toBe("indonesian");
  });

  it("collapses internal whitespace to dashes", () => {
    expect(slugify("bahasa indonesia")).toBe("bahasa-indonesia");
    expect(slugify("bahasa   indonesia")).toBe("bahasa-indonesia");
  });

  it("strips characters outside [a-z0-9-_]", () => {
    expect(slugify("Arabic (MSA)")).toBe("arabic-msa");
    expect(slugify("español!")).toBe("espaol");
    expect(slugify("test@example.com")).toBe("testexamplecom");
  });

  it("trims leading and trailing dashes after stripping", () => {
    expect(slugify("---indonesian---")).toBe("indonesian");
    expect(slugify("(indonesian)")).toBe("indonesian");
  });

  it("returns empty string for input that has no valid characters", () => {
    // The dialog's submit path treats "" as an invalid slug and shows
    // the 'Enter a slug' error — the returned "" is the signal.
    expect(slugify("!!!")).toBe("");
    expect(slugify("@@")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("preserves underscores (worker allows them in slugs)", () => {
    expect(slugify("mode_v2")).toBe("mode_v2");
    expect(slugify("_leading")).toBe("_leading");
  });
});
