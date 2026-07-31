import { describe, expect, it } from "vitest";

import { safeResourceHref } from "../src/lib/resource-href";

describe("safeResourceHref", () => {
  it("passes absolute http(s) URLs through unchanged", () => {
    expect(safeResourceHref("https://git.door43.org/en_ult")).toBe(
      "https://git.door43.org/en_ult"
    );
    expect(safeResourceHref("http://example.org/x?y=1#z")).toBe(
      "http://example.org/x?y=1#z"
    );
  });

  it("rejects non-http(s) schemes from a hostile or broken server", () => {
    expect(safeResourceHref("javascript:alert(1)")).toBeUndefined();
    expect(
      safeResourceHref("data:text/html,<script>1</script>")
    ).toBeUndefined();
    expect(safeResourceHref("vbscript:x")).toBeUndefined();
    expect(safeResourceHref("file:///etc/passwd")).toBeUndefined();
  });

  it("rejects relative and malformed URLs rather than resolving them", () => {
    expect(safeResourceHref("/relative/path")).toBeUndefined();
    expect(safeResourceHref("not a url")).toBeUndefined();
    expect(safeResourceHref("//protocol-relative.example")).toBeUndefined();
  });

  it("returns undefined for missing input", () => {
    expect(safeResourceHref(undefined)).toBeUndefined();
    expect(safeResourceHref("")).toBeUndefined();
  });
});
