import { describe, expect, it } from "vitest";

import { stillOwnsSelection } from "../src/lib/mutation-ownership";

describe("stillOwnsSelection", () => {
  it("owns the selection when org and language both match", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: "en" }
      )
    ).toBe(true);
  });

  it("does not own when the language switched during the mutation", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: "fr" }
      )
    ).toBe(false);
  });

  it("does not own when the org switched but the language slug is the same", () => {
    // The load-bearing case: `en` exists in both orgs, so a language-only
    // check would wrongly report ownership and stamp org A's document onto
    // org B's row. The org dimension is what makes this false.
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "partner-org", language: "en" }
      )
    ).toBe(false);
  });

  it("does not own when both org and language switched", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "partner-org", language: "fr" }
      )
    ).toBe(false);
  });

  it("treats a null language as a first-class value that matches null", () => {
    expect(
      stillOwnsSelection(
        { org: "partner-org", language: null },
        { org: "partner-org", language: null }
      )
    ).toBe(true);
  });

  it("does not own when the target had no language but a selection now exists", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: null },
        { org: null, language: "en" }
      )
    ).toBe(false);
  });

  it("distinguishes a null org (home) from a named org", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "unfoldingWord", language: "en" }
      )
    ).toBe(false);
  });
});
