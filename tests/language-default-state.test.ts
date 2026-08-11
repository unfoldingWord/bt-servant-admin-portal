import { describe, expect, it } from "vitest";

import {
  computeLanguageDefaultState,
  defaultLanguageName,
  describeLanguageDefault,
  isDefaultControlAvailable,
  type LanguageDefaultInputs,
} from "../src/lib/language-default-state";
import type { Language, OrgDefaultLanguage } from "../src/types/language";

// #286 — the three states Ian asked the Languages page to render, plus the
// four the implementation has to survive: an endpoint that isn't deployed
// yet, a read that genuinely failed, either query still in flight, and a
// default pointing at a slug that isn't in the list.

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

// Settled, successful, list-loaded — the baseline every test perturbs.
function inputs(over: Partial<LanguageDefaultInputs> = {}) {
  return {
    orgDefault: supported("hindi"),
    isPending: false,
    isError: false,
    languages: [hindi, swahili],
    ...over,
  } satisfies LanguageDefaultInputs;
}

describe("computeLanguageDefaultState — resolved states", () => {
  it("default + published → healthy", () => {
    expect(computeLanguageDefaultState(inputs())).toEqual({
      kind: "healthy",
      name: "hindi",
      label: "Hindi",
    });
  });

  it("default + unpublished → unpublished (deliberately legal per worker#236)", () => {
    const state = computeLanguageDefaultState(
      inputs({ languages: [hindiDraft] })
    );
    expect(state.kind).toBe("unpublished");
  });

  it("treats a language with no `published` field as a draft", () => {
    // Engine rows predating the published flag omit it; a missing flag must
    // never read as "live for end users".
    const state = computeLanguageDefaultState(
      inputs({
        orgDefault: supported("swahili"),
        languages: [{ name: "swahili" }],
      })
    );
    expect(state.kind).toBe("unpublished");
  });

  it("no default set → none", () => {
    expect(
      computeLanguageDefaultState(inputs({ orgDefault: supported(null) }))
    ).toEqual({ kind: "none" });
  });

  it("default pointing at a slug that isn't in the RESOLVED list → missing", () => {
    expect(
      computeLanguageDefaultState(inputs({ orgDefault: supported("gone") }))
    ).toEqual({ kind: "missing", name: "gone" });
  });

  it("omits `label` when the entry has none (no fabricated display name)", () => {
    expect(
      computeLanguageDefaultState(
        inputs({ orgDefault: supported("swahili"), languages: [swahili] })
      )
    ).toEqual({ kind: "healthy", name: "swahili" });
  });
});

describe("computeLanguageDefaultState — unresolved reads never make claims", () => {
  it("in-flight collection + resolved default → pending, NOT the drift warning", () => {
    // The default payload is tiny and lands first on essentially every
    // page load and org switch. Collapsing `undefined` into an empty list
    // made that ordinary window render the amber "points at X, which isn't
    // in this org's language list" — a false accusation, and a permanent
    // one whenever the collection query failed.
    expect(
      computeLanguageDefaultState(inputs({ languages: undefined }))
    ).toEqual({ kind: "pending" });
  });

  it("in-flight default query → pending, NOT 'no default set'", () => {
    expect(
      computeLanguageDefaultState(
        inputs({ orgDefault: undefined, isPending: true })
      )
    ).toEqual({ kind: "pending" });
  });

  it("data absent with no pending flag wired → still pending, never a claim", () => {
    expect(
      computeLanguageDefaultState(
        inputs({ orgDefault: undefined, isPending: false })
      )
    ).toEqual({ kind: "pending" });
  });

  it("a failed default read → error, NOT 'not available on this worker'", () => {
    // 404/501 resolve as `{ supported: false }` in languages-api, so a
    // rejection is a 5xx or a network fault. Claiming the feature doesn't
    // exist would hide a real outage behind a permanent, undiagnosable lie.
    expect(
      computeLanguageDefaultState(
        inputs({ orgDefault: undefined, isError: true })
      )
    ).toEqual({ kind: "error" });
  });

  it("error wins over a stale pending flag", () => {
    expect(
      computeLanguageDefaultState(
        inputs({ orgDefault: undefined, isPending: true, isError: true })
      )
    ).toEqual({ kind: "error" });
  });

  it("endpoint absent (worker predates worker#236) → unsupported", () => {
    expect(
      computeLanguageDefaultState(inputs({ orgDefault: { supported: false } }))
    ).toEqual({ kind: "unsupported" });
  });
});

describe("describeLanguageDefault", () => {
  it("healthy reads as a subtle confirmation, not a warning", () => {
    const notice = describeLanguageDefault(
      { kind: "healthy", name: "hindi", label: "Hindi" },
      true
    )!;
    expect(notice.tone).toBe("healthy");
    expect(notice.message).toContain("Hindi");
    expect(notice.message).toContain("org default");
  });

  it("unpublished warns that end users get no tuning until it's published", () => {
    const notice = describeLanguageDefault(
      { kind: "unpublished", name: "hindi" },
      true
    )!;
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("no tuning until it's published");
  });

  it("none explains that tuning only arrives via @language", () => {
    const notice = describeLanguageDefault({ kind: "none" }, true)!;
    expect(notice.tone).toBe("info");
    expect(notice.message).toContain("@language");
  });

  it("missing warns about the dangling reference by slug", () => {
    const notice = describeLanguageDefault(
      { kind: "missing", name: "gone" },
      true
    )!;
    expect(notice.tone).toBe("warning");
    expect(notice.message).toContain("gone");
  });

  it("error says the READ failed and that the default is untouched", () => {
    const notice = describeLanguageDefault({ kind: "error" }, true)!;
    expect(notice.tone).toBe("error");
    expect(notice.message).toMatch(/Couldn't load/);
    expect(notice.message).toContain("unchanged");
  });

  it("pending and unsupported render no notice at all", () => {
    expect(describeLanguageDefault({ kind: "pending" }, true)).toBeNull();
    expect(describeLanguageDefault({ kind: "unsupported" }, true)).toBeNull();
  });

  it("falls back to the slug when the entry has no label", () => {
    const notice = describeLanguageDefault(
      { kind: "healthy", name: "hindi" },
      true
    )!;
    expect(notice.message).toContain('"hindi"');
  });
});

// A shepherd holding edit+publish on the org-default language CAN delete
// it (per-row rights) but CANNOT set or clear the org default (admin gate
// on the BFF PUT). Any copy that prescribes an action has to know which
// audience it is talking to, or it sends half the users at a button they
// will never be shown.

describe("describeLanguageDefault — role-aware prescriptions", () => {
  it("tells an admin to pick a new default when the pointer is dangling", () => {
    const notice = describeLanguageDefault(
      { kind: "missing", name: "gone" },
      true
    )!;
    expect(notice.message).toContain("Pick a new default");
    expect(notice.message).not.toContain("Ask an admin");
  });

  it("tells a non-admin to ask an admin instead", () => {
    const notice = describeLanguageDefault(
      { kind: "missing", name: "gone" },
      false
    )!;
    expect(notice.message).toContain("Ask an admin to pick a new default");
    expect(notice.message).not.toMatch(/^.*\bPick a new default\b/);
  });

  it("leaves purely descriptive copy identical for both audiences", () => {
    // `none`, `healthy` and `unpublished` state facts about what end users
    // get; only `missing` prescribes an admin-only action.
    for (const state of [
      { kind: "none" } as const,
      { kind: "healthy", name: "hindi" } as const,
      { kind: "unpublished", name: "hindi" } as const,
    ]) {
      expect(describeLanguageDefault(state, true)).toEqual(
        describeLanguageDefault(state, false)
      );
    }
  });
});

describe("isDefaultControlAvailable", () => {
  it("offers the set/clear control only once the current default is known", () => {
    expect(isDefaultControlAvailable({ kind: "none" })).toBe(true);
    expect(isDefaultControlAvailable({ kind: "healthy", name: "hindi" })).toBe(
      true
    );
    expect(
      isDefaultControlAvailable({ kind: "unpublished", name: "hindi" })
    ).toBe(true);
    expect(isDefaultControlAvailable({ kind: "missing", name: "gone" })).toBe(
      true
    );
  });

  it("withholds it while pending, unsupported, or failed", () => {
    // Offering "Set as default" against an unknown current value invites a
    // write whose effect the admin can't predict.
    expect(isDefaultControlAvailable({ kind: "pending" })).toBe(false);
    expect(isDefaultControlAvailable({ kind: "unsupported" })).toBe(false);
    expect(isDefaultControlAvailable({ kind: "error" })).toBe(false);
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
    expect(defaultLanguageName({ kind: "pending" })).toBeNull();
    expect(defaultLanguageName({ kind: "error" })).toBeNull();
  });
});
