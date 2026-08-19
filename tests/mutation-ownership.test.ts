import { describe, expect, it } from "vitest";

import {
  mayApplyMutationResult,
  type SelectionTarget,
  stillOwnsSelection,
} from "../src/lib/mutation-ownership";

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

  it("does not own when the selection was CLEARED during the mutation", () => {
    // The load-bearing runtime case: a delete (or discard-and-switch) settles
    // after the selection was nulled. The mutation must not touch bookkeeping
    // for a row that is no longer selected.
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: null }
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

describe("mayApplyMutationResult", () => {
  const en: SelectionTarget = { org: null, language: "en" };
  const fr: SelectionTarget = { org: null, language: "fr" };

  it("allows the stamp when the pair matches and the generation is unchanged", () => {
    expect(mayApplyMutationResult(en, en, 3, 3)).toBe(true);
  });

  it("refuses the stamp on RE-ENTRY: same pair, but the generation moved", () => {
    // en (gen 3) → fr → back to en (gen 5) while the PUT was in flight. The
    // pair matches again, but the locals were re-anchored in between, so
    // stamping would revert the save.
    expect(mayApplyMutationResult(en, en, 3, 5)).toBe(false);
  });

  it("refuses the stamp when the pair no longer matches, generation aside", () => {
    expect(mayApplyMutationResult(en, fr, 3, 3)).toBe(false);
  });

  it("refuses the stamp when both the pair and the generation differ", () => {
    expect(mayApplyMutationResult(en, fr, 3, 4)).toBe(false);
  });
});
