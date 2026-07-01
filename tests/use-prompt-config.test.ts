import { describe, expect, it } from "vitest";

import {
  applyCloneToModeList,
  applyRenameToModeList,
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
