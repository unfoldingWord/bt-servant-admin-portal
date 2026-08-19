import { describe, expect, it } from "vitest";

import { classifyLanguageCreate } from "../src/lib/language-create";

const draft = { published: false };
const published = { published: true };

describe("classifyLanguageCreate", () => {
  it("creates a brand-new slug", () => {
    expect(classifyLanguageCreate("arabic", null, "*", "*")).toEqual({
      kind: "create",
    });
  });

  it("confirms when an admin (rights '*') re-creates any existing language", () => {
    expect(classifyLanguageCreate("hindi", published, "*", "*")).toEqual({
      kind: "confirm",
    });
  });

  it("confirms when a shepherd holds edit (and publish) on a published target", () => {
    expect(
      classifyLanguageCreate("hindi", published, ["hindi"], ["hindi"])
    ).toEqual({ kind: "confirm" });
  });

  it("confirms overwriting a DRAFT with only edit rights — no publish needed", () => {
    expect(classifyLanguageCreate("hindi", draft, ["hindi"], [])).toEqual({
      kind: "confirm",
    });
  });

  it("blocks (reason edit) when the caller has no edit right on the existing slug", () => {
    expect(
      classifyLanguageCreate("hindi", draft, ["french"], ["french"])
    ).toEqual({ kind: "blocked", reason: "edit" });
  });

  it("blocks (reason publish) an edit-only caller overwriting a PUBLISHED language", () => {
    // Re-scaffolding a published row sends published:false, which the worker
    // treats as a publish-verb change — so edit alone would 403.
    expect(classifyLanguageCreate("hindi", published, ["hindi"], [])).toEqual({
      kind: "blocked",
      reason: "publish",
    });
  });

  it("treats undefined rights (legacy full access) like '*' — confirm on a published collision", () => {
    expect(
      classifyLanguageCreate("hindi", published, undefined, undefined)
    ).toEqual({ kind: "confirm" });
  });
});
