import { describe, expect, it } from "vitest";

import { addSlugToRights } from "../src/lib/rights-merge";

// The three branches are load-bearing for #247 review F4 — a broader
// grant must never be silently narrowed by the auto-select flow.

describe("addSlugToRights", () => {
  it("undefined stays undefined (legacy full access preserved)", () => {
    // A pre-verb-perms user has full access via the undefined
    // sentinel. Auto-selecting to `["indonesian"]` would silently
    // narrow their access to just that one language.
    expect(addSlugToRights(undefined, "indonesian")).toBeUndefined();
  });

  it("'*' stays '*' (explicit full access preserved)", () => {
    expect(addSlugToRights("*", "indonesian")).toBe("*");
  });

  it("empty array → array with the slug", () => {
    // Elsy's exact deadlock case: user was created with [], first
    // draft bootstraps as "indonesian", auto-select must grant it.
    expect(addSlugToRights([], "indonesian")).toEqual(["indonesian"]);
  });

  it("adds slug to non-empty array and sorts", () => {
    expect(addSlugToRights(["english"], "arabic")).toEqual([
      "arabic",
      "english",
    ]);
    expect(addSlugToRights(["english", "spanish"], "arabic")).toEqual([
      "arabic",
      "english",
      "spanish",
    ]);
  });

  it("no-op when slug already granted (identity, not new sorted copy)", () => {
    // Idempotency lets the parent call this in setState updaters
    // without triggering a spurious re-render / diff on second click.
    const rights = ["arabic", "english"];
    expect(addSlugToRights(rights, "arabic")).toBe(rights);
  });
});
