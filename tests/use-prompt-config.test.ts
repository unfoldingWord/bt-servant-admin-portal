import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyCloneToModeList,
  applyRenameToModeList,
  applyRetireToModeList,
  modeQueryKeys,
  saveModeMutationOptions,
} from "../src/hooks/use-prompt-config";
import type { OrgModes, PromptMode } from "../src/types/prompt-override";

// Regression for the #232 review (PR #238): after a successful rename the
// page selects the new slug immediately. The list cache must already carry
// that slug or the stale-selection guard in modes.tsx nulls the selection
// in the render gap before the refetch lands. applyRenameToModeList is the
// optimistic write that closes that gap.

const renamed: PromptMode = {
  name: "conversation",
  label: "Conversation",
  document: "## Identity\n",
  published: true,
};

describe("applyRenameToModeList", () => {
  it("replaces the old slug with the renamed mode (new slug present, old gone)", () => {
    const prev: OrgModes = {
      modes: [
        { name: "spoken", document: "## Identity\n", published: true },
        { name: "written", document: "## Identity\n", published: false },
      ],
    };

    const next = applyRenameToModeList(prev, "spoken", renamed);

    const names = next!.modes.map((m) => m.name);
    expect(names).toContain("conversation");
    expect(names).not.toContain("spoken");
    // Position is preserved (in-place swap, not append).
    expect(names).toEqual(["conversation", "written"]);
  });

  it("leaves other modes untouched", () => {
    const written: PromptMode = {
      name: "written",
      document: "## Identity\n",
      published: false,
    };
    const prev: OrgModes = {
      modes: [{ name: "spoken", document: "x", published: true }, written],
    };

    const next = applyRenameToModeList(prev, "spoken", renamed);

    expect(next!.modes[1]).toBe(written);
  });

  it("returns undefined unchanged when nothing is cached yet", () => {
    expect(applyRenameToModeList(undefined, "spoken", renamed)).toBeUndefined();
  });

  it("is a no-op when the old slug isn't in the list (no fabrication)", () => {
    const prev: OrgModes = {
      modes: [{ name: "written", document: "x", published: false }],
    };

    const next = applyRenameToModeList(prev, "spoken", renamed);

    expect(next!.modes.map((m) => m.name)).toEqual(["written"]);
  });
});

// Regression for the #241 PR B review (Frank F2): after a successful clone
// the page follows selection to the new slug. Without an optimistic list
// write, the stale-selection guard in modes.tsx sees the new slug missing
// from `modesQuery.data` and clears the selection before the invalidated
// list refetches. applyCloneToModeList closes that gap by appending the
// cloned mode synchronously.

const cloned: PromptMode = {
  name: "spoken-v2",
  label: "Spoken v2",
  document: "## Identity\n",
  published: false,
};

describe("applyCloneToModeList", () => {
  it("appends the cloned mode to the list (source untouched)", () => {
    const prev: OrgModes = {
      modes: [
        { name: "spoken", document: "## Identity\n", published: true },
        { name: "written", document: "## Identity\n", published: false },
      ],
    };

    const next = applyCloneToModeList(prev, cloned);

    // Source and sibling both preserved; the clone lands at the tail.
    expect(next!.modes.map((m) => m.name)).toEqual([
      "spoken",
      "written",
      "spoken-v2",
    ]);
  });

  it("returns undefined unchanged when nothing is cached yet", () => {
    expect(applyCloneToModeList(undefined, cloned)).toBeUndefined();
  });

  it("replaces an existing entry rather than duplicating (concurrent-tab race guard)", () => {
    // A tab that already saw the clone via a background refetch would
    // otherwise pick up a duplicate key here; the modes-list Select
    // renders `key={m.name}` and duplicates would surface as a React
    // warning + collapsed dropdown.
    const stale: PromptMode = {
      name: "spoken-v2",
      document: "## Old\n",
      published: false,
    };
    const prev: OrgModes = {
      modes: [
        { name: "spoken", document: "## Identity\n", published: true },
        stale,
      ],
    };

    const next = applyCloneToModeList(prev, cloned);

    expect(next!.modes).toHaveLength(2);
    // In-place replacement preserves position AND swaps to the fresh
    // payload (label + document from the mutation response).
    expect(next!.modes[1]).toBe(cloned);
    expect(next!.modes[1]).not.toBe(stale);
  });
});

// Regression + spec for the #241 PR C retire-and-forward cache
// surgery. The engine returns the TARGET mode (widened aliases) and the
// source is deleted. The list cache must drop the source AND replace
// the target with the response payload — the page's post-retire
// `handleSelectMode(target.name)` reads from `modesQuery.data` and the
// stale-selection guard would fire on either half being out of sync.

const retireTarget: PromptMode = {
  name: "conversation",
  label: "Conversation",
  document: "## Identity\n",
  published: true,
  aliases: ["spoken", "spoken-old"],
};

describe("applyRetireToModeList", () => {
  it("drops the source and replaces the target with the response payload", () => {
    const prev: OrgModes = {
      modes: [
        { name: "spoken", document: "## src\n", published: true },
        {
          name: "conversation",
          document: "## tgt-old\n",
          published: true,
          aliases: ["conv-old"],
        },
        { name: "written", document: "## other\n", published: false },
      ],
    };

    const next = applyRetireToModeList(prev, "spoken", retireTarget);

    expect(next!.modes.map((m) => m.name)).toEqual(["conversation", "written"]);
    // Target's entry is the response payload verbatim (aliases now
    // include the source's slug + its own prior aliases).
    const target = next!.modes.find((m) => m.name === "conversation");
    expect(target).toBe(retireTarget);
    expect(target?.aliases).toEqual(["spoken", "spoken-old"]);
  });

  it("returns undefined unchanged when nothing is cached yet", () => {
    expect(
      applyRetireToModeList(undefined, "spoken", retireTarget)
    ).toBeUndefined();
  });

  it("is a no-op on source removal when the source isn't in the list (no fabrication)", () => {
    // Concurrent tab already saw the retire and refetched, or the
    // source was never in this cache. The target still gets its
    // replace; nothing is fabricated on the source side.
    const prev: OrgModes = {
      modes: [
        {
          name: "conversation",
          document: "## tgt-old\n",
          published: true,
        },
      ],
    };

    const next = applyRetireToModeList(prev, "spoken", retireTarget);

    expect(next!.modes.map((m) => m.name)).toEqual(["conversation"]);
    expect(next!.modes[0]).toBe(retireTarget);
  });

  it("leaves target replace as a no-op when the target isn't in the list yet either", () => {
    // Edge case: neither source nor target in the cache. The source
    // filter is a no-op (source not there), the target map is a no-op
    // (target not there). Cache stays effectively unchanged.
    const prev: OrgModes = {
      modes: [{ name: "written", document: "x", published: false }],
    };

    const next = applyRetireToModeList(prev, "spoken", retireTarget);

    expect(next!.modes.map((m) => m.name)).toEqual(["written"]);
  });
});

// #308 — the opt-in cache seed on the mode save hook. The seed runs INSIDE
// the hook's `onSuccess`, which TanStack awaits before it flips `isPending`
// and before any mutate-level callback; these tests pin what that onSuccess
// does to a real QueryClient so the page's create/import paths can rely on
// the row being in the live list the moment the mutation settles.
describe("saveModeMutationOptions — opt-in seed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeClient(): QueryClient {
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }

  const saved: PromptMode = {
    name: "spoken",
    document: "fresh",
    published: false,
  };

  it("without `seed`, only invalidates (the #306 rule for ordinary editor saves)", async () => {
    const qc = makeClient();
    qc.setQueryData<OrgModes>(modeQueryKeys.modes(null), { modes: [] });
    const setSpy = vi.spyOn(qc, "setQueryData");
    const cancelSpy = vi.spyOn(qc, "cancelQueries");
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    await saveModeMutationOptions(qc, null).onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
    });
    expect(setSpy).not.toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      modeQueryKeys.modes(null),
      modeQueryKeys.mode("spoken", null),
    ]);
    expect(qc.getQueryData<OrgModes>(modeQueryKeys.modes(null))?.modes).toEqual(
      []
    );
  });

  it("with `seed`, the row is in the list AND the per-mode cache when onSuccess resolves", async () => {
    const qc = makeClient();
    qc.setQueryData<OrgModes>(modeQueryKeys.modes(null), {
      modes: [{ name: "written", document: "w" }],
    });
    await saveModeMutationOptions(qc, null).onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
      seed: { org: null },
    });
    expect(qc.getQueryData(modeQueryKeys.mode("spoken", null))).toEqual(saved);
    const names = qc
      .getQueryData<OrgModes>(modeQueryKeys.modes(null))
      ?.modes.map((m) => m.name);
    expect(names).toEqual(["written", "spoken"]);
  });

  it("cancels BOTH GETs before writing, and invalidates only AFTER the seed", async () => {
    const qc = makeClient();
    qc.setQueryData<OrgModes>(modeQueryKeys.modes(null), { modes: [] });
    const order: string[] = [];
    vi.spyOn(qc, "cancelQueries").mockImplementation(async (f) => {
      order.push(`cancel:${JSON.stringify(f?.queryKey)}`);
    });
    const realSet = qc.setQueryData.bind(qc);
    vi.spyOn(qc, "setQueryData").mockImplementation((key, updater) => {
      order.push(`set:${JSON.stringify(key)}`);
      return realSet(key, updater as never);
    });
    vi.spyOn(qc, "invalidateQueries").mockImplementation(async (f) => {
      order.push(`invalidate:${JSON.stringify(f?.queryKey)}`);
    });
    await saveModeMutationOptions(qc, null).onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
      seed: { org: null },
    });
    expect(order).toEqual([
      `cancel:${JSON.stringify(modeQueryKeys.mode("spoken", null))}`,
      `set:${JSON.stringify(modeQueryKeys.mode("spoken", null))}`,
      `cancel:${JSON.stringify(modeQueryKeys.modes(null))}`,
      `set:${JSON.stringify(modeQueryKeys.modes(null))}`,
      `invalidate:${JSON.stringify(modeQueryKeys.modes(null))}`,
      `invalidate:${JSON.stringify(modeQueryKeys.mode("spoken", null))}`,
    ]);
  });

  it("seeds the org pinned in `seed`, not the hook's ambient key", async () => {
    // The org-context switch dialog offers "Discard and switch" while a save
    // is in flight, and TanStack hands a settled mutation the LATEST
    // options — so the ambient key can already be org B when org A's PUT
    // settles. The seed must follow the org the caller pinned.
    const qc = makeClient();
    qc.setQueryData<OrgModes>(modeQueryKeys.modes("alpha"), { modes: [] });
    qc.setQueryData<OrgModes>(modeQueryKeys.modes("beta"), { modes: [] });
    await saveModeMutationOptions(qc, "beta").onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
      seed: { org: "alpha" },
    });
    expect(
      qc.getQueryData<OrgModes>(modeQueryKeys.modes("alpha"))?.modes
    ).toEqual([saved]);
    expect(
      qc.getQueryData<OrgModes>(modeQueryKeys.modes("beta"))?.modes
    ).toEqual([]);
    expect(qc.getQueryData(modeQueryKeys.mode("spoken", "alpha"))).toEqual(
      saved
    );
    expect(
      qc.getQueryData(modeQueryKeys.mode("spoken", "beta"))
    ).toBeUndefined();
  });

  it("an in-flight list GET that settles after the seed cannot drop the row", async () => {
    // Real cancel semantics, not a spy: start a fetch that would resolve to a
    // list WITHOUT the new row, seed while it is in flight, and check the
    // row survives once everything settles.
    const qc = makeClient();
    qc.setQueryData<OrgModes>(modeQueryKeys.modes(null), { modes: [] });
    let resolveFetch: (v: OrgModes) => void = () => {};
    const pending = qc.fetchQuery({
      queryKey: modeQueryKeys.modes(null),
      queryFn: () =>
        new Promise<OrgModes>((resolve) => {
          resolveFetch = resolve;
        }),
      staleTime: 0,
    });
    await saveModeMutationOptions(qc, null).onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
      seed: { org: null },
    });
    resolveFetch({ modes: [] });
    await pending.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(
      qc.getQueryData<OrgModes>(modeQueryKeys.modes(null))?.modes
    ).toContainEqual(saved);
  });

  it("does not fabricate a list when nothing is cached for the seed org", async () => {
    const qc = makeClient();
    await saveModeMutationOptions(qc, null).onSuccess(saved, {
      name: "spoken",
      body: { document: "fresh" },
      seed: { org: null },
    });
    expect(qc.getQueryData(modeQueryKeys.modes(null))).toBeUndefined();
    expect(qc.getQueryData(modeQueryKeys.mode("spoken", null))).toEqual(saved);
  });
});
