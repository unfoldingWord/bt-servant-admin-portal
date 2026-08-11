import { describe, expect, it } from "vitest";

import {
  describeLanguageDeleteError,
  isDefaultBlockedDeleteError,
  selectLanguageMutationBanner,
} from "../src/lib/language-error-surface";
import {
  LanguageForbiddenError,
  LanguageIsDefaultError,
} from "../src/lib/languages-api";

// #286 review — two rules: one surface per failure, and copy that
// prescribes an action must know who is reading.

describe("selectLanguageMutationBanner — the org-default 409 has ONE surface", () => {
  it("keeps the delete-409 off the page banner (the dialog owns it)", () => {
    // Both surfaces at once is redundant while the failure is current,
    // and the banner outlives the dialog: the admin clears the default,
    // dismisses the dialog, and the page keeps insisting the language
    // can't be deleted because it may be the default — which it no
    // longer is.
    expect(
      selectLanguageMutationBanner(null, new LanguageIsDefaultError("hindi"))
    ).toBeNull();
  });

  it("still banners other delete failures — silence is not the fix", () => {
    const err = new Error("Failed to delete language (500): boom");
    expect(selectLanguageMutationBanner(null, err)).toBe(err);
  });

  it("still banners save failures", () => {
    const err = new Error("Failed to save language (500): boom");
    expect(selectLanguageMutationBanner(err, null)).toBe(err);
  });

  it("leaves forbidden errors to their dedicated banner", () => {
    expect(
      selectLanguageMutationBanner(
        new LanguageForbiddenError("hindi", "write"),
        null
      )
    ).toBeNull();
    expect(
      selectLanguageMutationBanner(
        null,
        new LanguageForbiddenError("hindi", "delete")
      )
    ).toBeNull();
  });

  it("prefers the save error when both are present", () => {
    const save = new Error("save boom");
    const del = new Error("delete boom");
    expect(selectLanguageMutationBanner(save, del)).toBe(save);
  });

  it("returns null when nothing failed", () => {
    expect(selectLanguageMutationBanner(null, null)).toBeNull();
    expect(selectLanguageMutationBanner(undefined, undefined)).toBeNull();
  });
});

describe("isDefaultBlockedDeleteError — the recovery path", () => {
  it("identifies the 409 the set/clear action resolves", () => {
    // The page resets the delete mutation on a successful set/clear when
    // this returns true, so the stale 409 can't survive the very action
    // that unblocks it.
    expect(
      isDefaultBlockedDeleteError(new LanguageIsDefaultError("hindi"))
    ).toBe(true);
  });

  it("leaves unrelated failures alone — a 500 is not fixed by re-pointing the default", () => {
    expect(isDefaultBlockedDeleteError(new Error("boom"))).toBe(false);
    expect(
      isDefaultBlockedDeleteError(new LanguageForbiddenError("hindi", "delete"))
    ).toBe(false);
    expect(isDefaultBlockedDeleteError(null)).toBe(false);
    expect(isDefaultBlockedDeleteError(undefined)).toBe(false);
  });

  it("full recovery sequence: 409 → change the default → nothing left to show", () => {
    const blocked = new LanguageIsDefaultError("hindi");
    // While blocked: no page banner, dialog shows it, and the page knows
    // the pending set/clear will clear it.
    expect(selectLanguageMutationBanner(null, blocked)).toBeNull();
    expect(isDefaultBlockedDeleteError(blocked)).toBe(true);
    // After the admin sets a different default the page calls reset(), so
    // the mutation error is gone and neither surface has anything to say.
    const afterReset = null;
    expect(selectLanguageMutationBanner(null, afterReset)).toBeNull();
    expect(isDefaultBlockedDeleteError(afterReset)).toBe(false);
  });
});

// A shepherd holding edit+publish on the org-default language CAN delete
// it (per-row rights) but CANNOT set or clear the org default (admin gate
// on the BFF PUT).

describe("describeLanguageDeleteError", () => {
  it("gives an admin the recovery they can actually perform", () => {
    const msg = describeLanguageDeleteError(
      new LanguageIsDefaultError("hindi"),
      true
    );
    expect(msg).toContain("hindi");
    expect(msg).toContain("Set a different default, or clear it");
    expect(msg).not.toContain("Ask an admin");
  });

  it("tells a shepherd to ask an admin — they can delete but not re-point", () => {
    const msg = describeLanguageDeleteError(
      new LanguageIsDefaultError("hindi"),
      false
    );
    expect(msg).toContain("Ask an admin to change or clear the default");
    expect(msg).not.toContain("Set a different default");
  });

  it("passes other errors through verbatim for both audiences", () => {
    const err = new Error("Failed to delete language (500): boom");
    expect(describeLanguageDeleteError(err, true)).toBe(err.message);
    expect(describeLanguageDeleteError(err, false)).toBe(err.message);
  });

  it("falls back to a generic message for a non-Error rejection", () => {
    expect(describeLanguageDeleteError("nope", true)).toBe(
      "Failed to delete language."
    );
  });
});
