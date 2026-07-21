import { describe, expect, it } from "vitest";

import { humanizeModeSlug, slugifyModeName } from "../src/lib/mode-slug";

describe("slugifyModeName", () => {
  it("lowercases and swaps interior whitespace runs for single hyphens", () => {
    expect(slugifyModeName("FIA Coach")).toBe("fia-coach");
    expect(slugifyModeName("kids   mode")).toBe("kids-mode");
  });

  it("drops characters outside [a-z0-9-_]", () => {
    expect(slugifyModeName("kids' mode!")).toBe("kids-mode");
    expect(slugifyModeName("café_mode")).toBe("caf_mode");
  });

  it("trims leading/trailing hyphens left by stripped characters", () => {
    expect(slugifyModeName("--edge--")).toBe("edge");
    expect(slugifyModeName(" (draft) ")).toBe("draft");
  });

  it("preserves existing hyphens and underscores", () => {
    expect(slugifyModeName("fia-drafting")).toBe("fia-drafting");
    expect(slugifyModeName("fia_drafting")).toBe("fia_drafting");
  });

  it("returns empty string when nothing survives", () => {
    expect(slugifyModeName("")).toBe("");
    expect(slugifyModeName("   ")).toBe("");
    expect(slugifyModeName("!!!")).toBe("");
  });
});

describe("humanizeModeSlug", () => {
  it("splits on hyphens and title-cases each word", () => {
    expect(humanizeModeSlug("fia-drafting")).toBe("Fia Drafting");
  });

  it("splits on underscores too", () => {
    expect(humanizeModeSlug("kids_mode")).toBe("Kids Mode");
  });

  it("collapses separator runs without emitting empty words", () => {
    expect(humanizeModeSlug("a--b__c")).toBe("A B C");
  });

  it("handles a single word", () => {
    expect(humanizeModeSlug("conversation")).toBe("Conversation");
  });

  it("returns empty string for empty input", () => {
    expect(humanizeModeSlug("")).toBe("");
  });

  it("round-trips with slugify for simple display names", () => {
    // The prompt's skip condition relies on this: a label whose slugified
    // form equals the new slug means there is no drift to fix.
    expect(slugifyModeName(humanizeModeSlug("fia-drafting"))).toBe(
      "fia-drafting"
    );
  });
});
