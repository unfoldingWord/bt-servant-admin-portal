import { describe, expect, it } from "vitest";

import {
  classifyMutationSettle,
  reconcileReanchor,
  stillOwnsSelection,
} from "../src/lib/mutation-ownership";

describe("stillOwnsSelection", () => {
  it("owns the selection when org and language both match", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: "en" }
      )
    ).toBe(true);
  });

  it("does not own when the language switched during the mutation", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: "fr" }
      )
    ).toBe(false);
  });

  it("does not own when the org switched but the language slug is the same", () => {
    // The load-bearing case: `en` exists in both orgs, so a language-only
    // check would wrongly report ownership and stamp org A's document onto
    // org B's row. The org dimension is what makes this false.
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "partner-org", language: "en" }
      )
    ).toBe(false);
  });

  it("does not own when both org and language switched", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "partner-org", language: "fr" }
      )
    ).toBe(false);
  });

  it("treats a null language as a first-class value that matches null", () => {
    expect(
      stillOwnsSelection(
        { org: "partner-org", language: null },
        { org: "partner-org", language: null }
      )
    ).toBe(true);
  });

  it("does not own when the target had no language but a selection now exists", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: null },
        { org: null, language: "en" }
      )
    ).toBe(false);
  });

  it("does not own when the selection was CLEARED during the mutation", () => {
    // The load-bearing runtime case: a delete (or discard-and-switch) settles
    // after the selection was nulled. The mutation must not touch bookkeeping
    // for a row that is no longer selected.
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: null, language: null }
      )
    ).toBe(false);
  });

  it("distinguishes a null org (home) from a named org", () => {
    expect(
      stillOwnsSelection(
        { org: null, language: "en" },
        { org: "unfoldingWord", language: "en" }
      )
    ).toBe(false);
  });
});

describe("classifyMutationSettle", () => {
  const en = { org: null, language: "en" };
  const fr = { org: null, language: "fr" };
  const enPartner = { org: "partner-org", language: "en" };

  it("applies when the pair matches and the generation never moved", () => {
    // The common case: a save settles with no leave-and-return, so the locals
    // it captured are still the locals on screen — stamp the result.
    expect(classifyMutationSettle(en, en, 3, 3)).toBe("apply");
  });

  it("skips when the language switched during the mutation", () => {
    // Another row is selected; its own bookkeeping is correct. Generation is
    // irrelevant once the pair no longer matches.
    expect(classifyMutationSettle(en, fr, 3, 5)).toBe("skip");
  });

  it("skips when the org switched to a same-slug namespace", () => {
    expect(classifyMutationSettle(en, enPartner, 3, 3)).toBe("skip");
  });

  it("skips when the selection was cleared during the mutation", () => {
    expect(
      classifyMutationSettle(en, { org: null, language: null }, 3, 4)
    ).toBe("skip");
  });

  it("resyncs on the leave-and-return race: pair matches but the generation moved", () => {
    // The load-bearing #307 case. `en` is still selected, so a pair-only gate
    // would stamp — but the generation moved, meaning the sync effect
    // re-anchored the locals to the reloaded cache while this PUT was in flight.
    // Stamping the captured value would revert the save; reload from cache.
    expect(classifyMutationSettle(en, en, 3, 4)).toBe("resync");
  });

  it("prefers skip over resync when BOTH the pair moved and the generation moved", () => {
    // Pair-mismatch dominates: if the selection is on a different row, we do
    // nothing regardless of the generation — there is nothing here to resync.
    expect(classifyMutationSettle(en, fr, 3, 9)).toBe("skip");
  });

  it("treats a matching null-language target as ownable and generation-gated", () => {
    const none = { org: "partner-org", language: null };
    expect(classifyMutationSettle(none, none, 2, 2)).toBe("apply");
    expect(classifyMutationSettle(none, none, 2, 3)).toBe("resync");
  });
});

describe("reconcileReanchor", () => {
  const saved = { document: "SAVED", published: true, label: "Saved Label" };

  it("reloads the draft from the saved row when it was untouched since the re-anchor", () => {
    // The pure #307 case: user left and returned WITHOUT typing, so the
    // re-anchor left draft === lastSyncedDoc ("OLD"). The editor should show
    // what was actually saved, and the baseline advances so no autosave reverts.
    const r = reconcileReanchor("OLD", "OLD", saved);
    expect(r.nextDraft).toBe("SAVED");
    expect(r.nextSyncedDoc).toBe("SAVED");
    expect(r.nextPublished).toBe(true);
    expect(r.nextLabel).toBe("Saved Label");
  });

  it("keeps a draft edited after re-entry (user-wins) while still advancing the baseline", () => {
    // User typed "WORLD" onto the re-anchored "OLD" after returning, so
    // draft ("OLDWORLD") !== lastSyncedDoc ("OLD"). Their newer text must not be
    // discarded (codex P1): nextDraft is null (keep it), but the baseline still
    // advances to the saved row so the flushing autosave doesn't revert the flag
    // (grok P2 publish-revert variant).
    const r = reconcileReanchor("OLDWORLD", "OLD", saved);
    expect(r.nextDraft).toBeNull();
    expect(r.nextSyncedDoc).toBe("SAVED");
    expect(r.nextPublished).toBe(true);
    expect(r.nextLabel).toBe("Saved Label");
  });

  it("carries an undefined saved label through unchanged", () => {
    const r = reconcileReanchor("OLD", "OLD", {
      document: "SAVED",
      published: false,
      label: undefined,
    });
    expect(r.nextDraft).toBe("SAVED");
    expect(r.nextLabel).toBeUndefined();
    expect(r.nextPublished).toBe(false);
  });
});
