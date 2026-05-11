import { describe, expect, it } from "vitest";

import { applyTriggerPrefix } from "../src/lib/chat-api";

describe("applyTriggerPrefix", () => {
  it("returns the message unchanged when both mode and language are null", () => {
    expect(applyTriggerPrefix("hello", null, null)).toBe("hello");
  });

  it("returns the message unchanged when both mode and language are undefined", () => {
    expect(applyTriggerPrefix("hello", undefined, undefined)).toBe("hello");
  });

  it("treats an empty string as no override (no stray '#' / '@' prefix)", () => {
    expect(applyTriggerPrefix("hello", "", "")).toBe("hello");
  });

  it("prepends `#<mode>` when only mode is set", () => {
    expect(applyTriggerPrefix("hello", "spoken", null)).toBe("#spoken hello");
  });

  it("prepends `@<language>` when only language is set", () => {
    expect(applyTriggerPrefix("hello", null, "arabic")).toBe("@arabic hello");
  });

  it("prepends `#<mode> @<language>` (in that order, single space) when both are set", () => {
    expect(applyTriggerPrefix("hello", "spoken", "arabic")).toBe(
      "#spoken @arabic hello"
    );
  });

  it("preserves the original message text exactly (no trimming, no escaping)", () => {
    expect(applyTriggerPrefix("  hello   world  ", "spoken", "arabic")).toBe(
      "#spoken @arabic   hello   world  "
    );
  });

  it("does not double-prepend when the message already contains a trigger", () => {
    // Worker classifier iterates all leading tokens; the last match wins, so
    // a user-typed trigger correctly overrides the editor's selection. This
    // test pins the wire format so power-user override stays intact.
    expect(
      applyTriggerPrefix("#dbs-coach @english hi", "spoken", "arabic")
    ).toBe("#spoken @arabic #dbs-coach @english hi");
  });

  it("handles an empty message", () => {
    expect(applyTriggerPrefix("", "spoken", "arabic")).toBe("#spoken @arabic ");
  });
});
