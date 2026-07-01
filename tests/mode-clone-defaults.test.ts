import { describe, expect, it } from "vitest";

import { pickCloneDefaultSlug } from "../src/lib/mode-clone-defaults";

// #241 PR B Frank F5: the clone dialog prefilled `${source}-copy`
// unconditionally, so the second click of Clone on the same source
// guaranteed a 409 collision. `pickCloneDefaultSlug` walks `-copy`,
// `-copy-2`, `-copy-3`, ... until it finds a free slot in the caller-
// provided existing-names set.

describe("pickCloneDefaultSlug", () => {
  it("uses the bare `${source}-copy` when nothing collides", () => {
    expect(pickCloneDefaultSlug("spoken", ["spoken", "written"])).toBe(
      "spoken-copy"
    );
  });

  it("walks to `-copy-2` when the bare form is taken", () => {
    expect(pickCloneDefaultSlug("spoken", ["spoken", "spoken-copy"])).toBe(
      "spoken-copy-2"
    );
  });

  it("skips holes and lands on the first free numbered slot", () => {
    // A sparse taken-set (missing `-copy-3`) still resolves to the next
    // sequential free slot rather than filling the gap — matches the
    // "keep incrementing until free" semantic the docstring promises.
    expect(
      pickCloneDefaultSlug("spoken", [
        "spoken",
        "spoken-copy",
        "spoken-copy-2",
        "spoken-copy-4",
      ])
    ).toBe("spoken-copy-3");
  });

  it("returns the base when the existing list is empty", () => {
    expect(pickCloneDefaultSlug("spoken", [])).toBe("spoken-copy");
  });

  it("dedupes against a mode whose canonical slug already IS `${source}-copy`", () => {
    // Someone renamed a mode to `spoken-copy` in the past, so a fresh
    // clone of `spoken` needs to jump to `-copy-2` on the first attempt.
    expect(pickCloneDefaultSlug("spoken", ["spoken", "spoken-copy"])).toBe(
      "spoken-copy-2"
    );
  });
});
