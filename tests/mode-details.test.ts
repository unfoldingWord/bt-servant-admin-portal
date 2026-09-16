import { describe, expect, it } from "vitest";

import {
  MODE_DETAILS_LIMITS,
  modeDetailsChanged,
  modeDetailsFromStored,
  modeDetailsOverLimit,
  normalizeModeDetails,
  toModeDetailsBody,
} from "@/lib/mode-details";

describe("mode-details — stored ↔ form (#328)", () => {
  it("reads unset fields as empty strings", () => {
    expect(modeDetailsFromStored(undefined)).toEqual({
      description: "",
      welcomeMessage: "",
    });
    expect(modeDetailsFromStored({ description: "d" })).toEqual({
      description: "d",
      welcomeMessage: "",
    });
  });

  it("normalizes by trimming both fields", () => {
    expect(
      normalizeModeDetails({ description: "  d  ", welcomeMessage: "\nw\n" })
    ).toEqual({ description: "d", welcomeMessage: "w" });
  });
});

describe("mode-details — change detection", () => {
  it("is unchanged when the trimmed form equals the stored values", () => {
    expect(
      modeDetailsChanged(
        { description: "d", welcome_message: "w" },
        { description: "d ", welcomeMessage: " w" }
      )
    ).toBe(false);
  });

  it("is unchanged when both are unset and the form is blank", () => {
    expect(
      modeDetailsChanged(undefined, { description: "  ", welcomeMessage: "" })
    ).toBe(false);
  });

  it("detects a cleared field", () => {
    expect(
      modeDetailsChanged(
        { description: "d", welcome_message: "w" },
        { description: "d", welcomeMessage: "" }
      )
    ).toBe(true);
  });

  it("detects a newly set field", () => {
    expect(
      modeDetailsChanged(undefined, { description: "", welcomeMessage: "hi" })
    ).toBe(true);
  });

  it("treats stored stray whitespace as cleanable (raw comparison)", () => {
    expect(
      modeDetailsChanged(
        { description: "d " },
        { description: "d", welcomeMessage: "" }
      )
    ).toBe(true);
  });
});

describe("mode-details — limits", () => {
  it("mirrors the worker caps", () => {
    expect(MODE_DETAILS_LIMITS).toEqual({
      description: 500,
      welcomeMessage: 1000,
    });
  });

  it("names the first field over its cap, after trimming", () => {
    expect(
      modeDetailsOverLimit({
        description: "x".repeat(500) + "   ",
        welcomeMessage: "",
      })
    ).toBeNull();
    expect(
      modeDetailsOverLimit({
        description: "x".repeat(501),
        welcomeMessage: "y".repeat(1001),
      })
    ).toBe("description");
    expect(
      modeDetailsOverLimit({
        description: "",
        welcomeMessage: "y".repeat(1001),
      })
    ).toBe("welcomeMessage");
  });
});

describe("mode-details — PUT body fragment", () => {
  it("sends trimmed values for set fields", () => {
    expect(
      toModeDetailsBody(undefined, {
        description: " d ",
        welcomeMessage: " w ",
      })
    ).toEqual({ description: "d", welcome_message: "w" });
  });

  it("sends '' to clear a field that is stored (both fields — null would not clear description on the worker)", () => {
    expect(
      toModeDetailsBody(
        { description: "d", welcome_message: "w" },
        { description: "", welcomeMessage: "   " }
      )
    ).toEqual({ description: "", welcome_message: "" });
  });

  it("omits an empty field that was never stored, so the BFF diff sees no change", () => {
    expect(
      toModeDetailsBody(undefined, { description: "", welcomeMessage: "" })
    ).toEqual({});
    expect(
      toModeDetailsBody(
        { description: "d" },
        { description: "d", welcomeMessage: "" }
      )
    ).toEqual({ description: "d" });
  });
});
