import { describe, expect, it } from "vitest";

import { classifyLanguageCreate } from "../src/lib/language-create";

describe("classifyLanguageCreate", () => {
  it("creates a brand-new slug", () => {
    expect(classifyLanguageCreate("arabic", ["hindi", "french"], "*")).toEqual({
      kind: "create",
    });
  });

  it("confirms when an admin (rights '*') re-creates an existing slug", () => {
    expect(classifyLanguageCreate("hindi", ["hindi"], "*")).toEqual({
      kind: "confirm",
    });
  });

  it("confirms when a shepherd holds an edit right on the existing slug", () => {
    expect(
      classifyLanguageCreate("hindi", ["hindi", "french"], ["hindi"])
    ).toEqual({ kind: "confirm" });
  });

  it("blocks when the slug exists but the caller has no edit right on it", () => {
    expect(
      classifyLanguageCreate("hindi", ["hindi", "french"], ["french"])
    ).toEqual({ kind: "blocked" });
  });

  it("blocks an existing slug when the caller holds no rights at all", () => {
    expect(classifyLanguageCreate("hindi", ["hindi"], [])).toEqual({
      kind: "blocked",
    });
  });

  it("still creates a NEW slug even with empty rights (the worker gates the write)", () => {
    expect(classifyLanguageCreate("arabic", ["hindi"], [])).toEqual({
      kind: "create",
    });
  });

  it("treats undefined rights (legacy full access) like '*' — confirm on collision", () => {
    expect(classifyLanguageCreate("hindi", ["hindi"], undefined)).toEqual({
      kind: "confirm",
    });
  });
});
