import { describe, expect, it } from "vitest";

import {
  computeLanguageDefaultState,
  defaultLanguageName,
  describeLanguageDefault,
} from "../src/lib/language-default-state";
import type { Language, OrgDefaultLanguage } from "../src/types/language";

// #286 — the three states Ian asked the Languages page to render, plus the
// two the implementation has to survive: an endpoint that isn't deployed
// yet, and a default pointing at a slug that isn't in the list.

const hindi: Language = {
  name: "hindi",
  label: "Hindi",
  document: "## Tone\n",
  published: true,
};
const hindiDraft: Language = { ...hindi, published: false };
const swahili: Language = { name: "swahili", document: "", published: true };

const supported = (name: string | null): OrgDefaultLanguage => ({
  supported: true,
  name,
});

describe("computeLanguageDefaultState", () => {
  it("default + published → healthy", () => {
    const state = computeLanguageDefaultState(supported("hindi"), [
      hindi,
      swahili,
    ]);
    expect(state).toEqual({ kind: "healthy", name: "hindi", label: "Hindi" });
  });

  it("default + unpublished → unpublished (deliberately legal per worker#236)", () => {
    const state = computeLanguageDefaultState(supported("hindi"), [hindiDraft]);
    expect(state.kind).toBe("unpublished");
  });

  it("treats a language with no `published` field as a draft", () => {
    // Engine rows predating the published flag omit it; a missing flag must
    // never read as "live for end users".
    const state = computeLanguageDefaultState(supported("swahili"), [
      { name: "swahili" },
    ]);
    expect(state.kind).toBe("unpublished");
  });

  it("no default set → none", () => {
    expect(computeLanguageDefaultState(supported(null), [hindi])).toEqual({
      kind: "none",
    });
  });

  it("endpoint absent (worker predates worker#236) → unsupported", () => {
    expect(computeLanguageDefaultState({ supported: false }, [hindi])).toEqual({
      kind: "unsupported",
    });
  });

  it("query not answered yet → unsupported, NOT 'none'", () => {
    // "No default is set" is a claim about the org. Rendering it while the
    // query is still in flight would flash a warning on every page load and
    // then silently contradict itself.
    expect(computeLanguageDefaultState(undefined, [hindi])).toEqual({
      kind: "unsupported",
    });
  });

  it("default pointing at a slug that isn't in the list → missing", () => {
    const state = computeLanguageDefaultState(supported("gone"), [hindi]);
    expect(state).toEqual({ kind: "missing", name: "gone" });
  });

  it("tolerates an undefined language list (list query still loading)", () => {
    expect(computeLanguageDefaultState(supported("hindi"), undefined)).toEqual({
      kind: "missing",
      name: "hindi",
    });
  });

  it("omits `label` when the entry has none (no fabricated display name)", () => {
    const state = computeLanguageDefaultState(supported("swahili"), [swahili]);
    expect(state).toEqual({ kind: "healthy", name: "swahili" });
  });
});

describe("describeLanguageDefault", () => {
  it("healthy reads as a subtle confirmation, not a warning", () => {
    const notice = describeLanguageDefault({
      kind: "healthy",
      name: "hindi",
      label: "Hindi",
    })!;
    expect(notice.tone).toBe("healthy");
    expect(notice.message).toContain("Hindi");
    expect(notice.message).toContain("org default");
  });

  it("unpublished warns that end users get no tuning until it's published", () => {
    const notice = describeLanguageDefault({
      kind: "unpublished",
      name: "hindi",
    })!;
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("no tuning until it's published");
  });

  it("none explains that tuning only arrives via @language", () => {
    const notice = describeLanguageDefault({ kind: "none" })!;
    expect(notice.tone).toBe("info");
    expect(notice.message).toContain("@language");
  });

  it("missing warns about the dangling reference by slug", () => {
    const notice = describeLanguageDefault({ kind: "missing", name: "gone" })!;
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("gone");
  });

  it("unsupported renders nothing at all", () => {
    expect(describeLanguageDefault({ kind: "unsupported" })).toBeNull();
  });

  it("falls back to the slug when the entry has no label", () => {
    const notice = describeLanguageDefault({ kind: "healthy", name: "hindi" })!;
    expect(notice.message).toContain('"hindi"');
  });
});

describe("defaultLanguageName", () => {
  it("returns the slug for every state that has one", () => {
    expect(defaultLanguageName({ kind: "healthy", name: "hindi" })).toBe(
      "hindi"
    );
    expect(defaultLanguageName({ kind: "unpublished", name: "hindi" })).toBe(
      "hindi"
    );
    expect(defaultLanguageName({ kind: "missing", name: "gone" })).toBe("gone");
  });

  it("returns null when there is no default to badge", () => {
    expect(defaultLanguageName({ kind: "none" })).toBeNull();
    expect(defaultLanguageName({ kind: "unsupported" })).toBeNull();
  });
});
