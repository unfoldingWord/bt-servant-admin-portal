import { describe, expect, it } from "vitest";
import {
  PUBLISH_UNSAVED_REASON,
  REQUIRES_GROUP_UNSAVED_REASON,
  RESOURCE_PRIORITIES_UNSAVED_REASON,
  SAVE_IN_FLIGHT_REASON,
  describeDraftCarryingBlock,
} from "@/lib/mode-copy";

// #344 — Publish / Unpublish, the Requires-group switch and the
// Resource-priorities opener each send the editor's draft, so each is gated
// the way the Details opener is (#337).
const CONTROLS = [
  ["Publish / Unpublish", PUBLISH_UNSAVED_REASON],
  ["Requires group chat", REQUIRES_GROUP_UNSAVED_REASON],
  ["Resource priorities", RESOURCE_PRIORITIES_UNSAVED_REASON],
] as const;

describe.each(CONTROLS)(
  "draft-carrying control — %s (#344)",
  (_name, unsavedReason) => {
    it("refuses while the editor's draft is unsaved, and says what to do", () => {
      // The PUT carries the whole document. On a rejected draft it would
      // fail with the document's error; on an untried one it would persist
      // the draft as a side effect.
      expect(
        describeDraftCarryingBlock(
          { isSaving: false, isDirty: true },
          unsavedReason
        )
      ).toBe(unsavedReason);
    });

    it("reports an in-flight save ahead of a dirty draft — it may land clean", () => {
      expect(
        describeDraftCarryingBlock(
          { isSaving: true, isDirty: true },
          unsavedReason
        )
      ).toBe(SAVE_IN_FLIGHT_REASON);
    });

    it("allows a clean draft with nothing in flight", () => {
      expect(
        describeDraftCarryingBlock(
          { isSaving: false, isDirty: false },
          unsavedReason
        )
      ).toBeNull();
    });
  }
);
