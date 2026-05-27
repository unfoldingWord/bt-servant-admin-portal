import { describe, expect, it } from "vitest";

import { decideContextChange } from "../src/lib/context-org-guard";

describe("decideContextChange", () => {
  // The no-op branch must fire before any dirty/saving check — picking
  // the already-selected value is the most common selector tick (e.g.,
  // React re-renders + Radix Select dispatches even when nothing
  // changed) and shouldn't ever prompt a confirmation dialog.
  describe("no-op when next === current", () => {
    it("home → home", () => {
      expect(decideContextChange(null, null, false, false)).toBe("no-op");
    });

    it("same other-org → same other-org", () => {
      expect(decideContextChange("acme", "acme", false, false)).toBe("no-op");
    });

    it("no-op even when dirty (a re-pick of the active org isn't a switch)", () => {
      expect(decideContextChange("acme", "acme", true, false)).toBe("no-op");
      expect(decideContextChange(null, null, true, true)).toBe("no-op");
    });
  });

  describe("apply when clean and changing", () => {
    it("home → other-org", () => {
      expect(decideContextChange(null, "acme", false, false)).toBe("apply");
    });

    it("other-org → home", () => {
      expect(decideContextChange("acme", null, false, false)).toBe("apply");
    });

    it("other-org → different other-org", () => {
      expect(decideContextChange("acme", "word-collective", false, false)).toBe(
        "apply"
      );
    });
  });

  describe("confirm when dirty or saving", () => {
    it("dirty alone triggers confirm", () => {
      expect(decideContextChange(null, "acme", true, false)).toBe("confirm");
    });

    it("saving alone triggers confirm (mid-flight save would race)", () => {
      // Without this, a switch fired during an in-flight save could land
      // the save in org-A while the page already shows org-B's content,
      // and an autosave triggered after the response would PUT org-B's
      // draft to org-A's namespace.
      expect(decideContextChange(null, "acme", false, true)).toBe("confirm");
    });

    it("dirty AND saving triggers confirm", () => {
      expect(decideContextChange("acme", null, true, true)).toBe("confirm");
    });

    it("confirm fires for every kind of switch (other→home, home→other, other→other)", () => {
      expect(decideContextChange("acme", null, true, false)).toBe("confirm");
      expect(decideContextChange(null, "acme", true, false)).toBe("confirm");
      expect(decideContextChange("acme", "word-collective", true, false)).toBe(
        "confirm"
      );
    });
  });
});
