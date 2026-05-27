import { describe, expect, it } from "vitest";

import { buildConfigUrl } from "../src/lib/config-url";

describe("buildConfigUrl", () => {
  it("returns the path unchanged when org is undefined", () => {
    expect(buildConfigUrl("/api/config/modes")).toBe("/api/config/modes");
  });

  it("returns the path unchanged when org is null", () => {
    expect(buildConfigUrl("/api/config/modes", null)).toBe("/api/config/modes");
  });

  it("returns the path unchanged when org is empty string", () => {
    expect(buildConfigUrl("/api/config/modes", "")).toBe("/api/config/modes");
  });

  it("returns the path unchanged when org is whitespace-only", () => {
    // Defense-in-depth: a stale `contextOrg = "  "` shouldn't poison every
    // URL with a guaranteed-400 param. The selector is the sole writer in
    // normal flow but the helper is the last line.
    expect(buildConfigUrl("/api/config/modes", "   ")).toBe(
      "/api/config/modes"
    );
  });

  it("appends ?org= when org is provided", () => {
    expect(buildConfigUrl("/api/config/modes", "word-collective")).toBe(
      "/api/config/modes?org=word-collective"
    );
  });

  it("trims the slug before encoding", () => {
    // Trim parity with the worker's resolveOrg — both sides accept the
    // same input shape so a stray space at either end doesn't yield a
    // hard 400.
    expect(buildConfigUrl("/api/config/modes", "  acme  ")).toBe(
      "/api/config/modes?org=acme"
    );
  });

  it("URL-encodes characters in the slug", () => {
    expect(buildConfigUrl("/api/config/modes", "word collective")).toBe(
      "/api/config/modes?org=word%20collective"
    );
    expect(buildConfigUrl("/api/config/modes", "a&b")).toBe(
      "/api/config/modes?org=a%26b"
    );
  });

  it("works for paths that already contain encoded segments", () => {
    expect(buildConfigUrl("/api/config/modes/spoken%20mode", "acme")).toBe(
      "/api/config/modes/spoken%20mode?org=acme"
    );
  });
});
