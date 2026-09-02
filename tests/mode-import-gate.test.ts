import { describe, expect, it } from "vitest";

import {
  applyCloneToModeList,
  applyRenameToModeList,
  applyRetireToModeList,
} from "../src/hooks/use-prompt-config";
import type { ParsedModeImport } from "../src/lib/mode-import";
import { classifyModeImport } from "../src/lib/mode-import-gate";
import type { OrgModes, PromptMode } from "../src/types/prompt-override";

// The #308 gate: one pure decision, run at file-pick AND again at
// overwrite-confirm against the LIVE list. The scenario tests at the bottom
// replay the exact cache mutations the page performs between those two
// points (create seed, rename, retire) and assert the answer changes.

function parsed(overrides: Partial<ParsedModeImport> = {}): ParsedModeImport {
  return {
    name: "spoken",
    document: "# Spoken\n",
    published: false,
    requires_group: false,
    droppedAliases: [],
    ...overrides,
  };
}

const spoken: PromptMode = {
  name: "spoken",
  document: "old",
  published: true,
};
const written: PromptMode = { name: "written", document: "w" };

describe("classifyModeImport — fail closed", () => {
  it("blocks when no list is cached (undefined), never treating it as empty", () => {
    const decision = classifyModeImport({
      mode: parsed(),
      modes: undefined,
      editRights: "*",
      publishRights: "*",
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toMatch(/still loading/);
  });

  it("an EMPTY cached list is a real answer: create", () => {
    expect(
      classifyModeImport({
        mode: parsed(),
        modes: [],
        editRights: "*",
        publishRights: "*",
      })
    ).toEqual({ kind: "create" });
  });
});

describe("classifyModeImport — collision identity", () => {
  it("create when the slug is absent from the list", () => {
    expect(
      classifyModeImport({
        mode: parsed(),
        modes: [written],
        editRights: "*",
        publishRights: "*",
      })
    ).toEqual({ kind: "create" });
  });

  it("overwrite (carrying the existing row) when the slug is canonical", () => {
    const decision = classifyModeImport({
      mode: parsed({ published: true }),
      modes: [spoken, written],
      editRights: "*",
      publishRights: "*",
    });
    expect(decision).toEqual({ kind: "overwrite", existing: spoken });
  });

  it("refuses a slug that is an ALIAS of another mode (PUT would land on the canonical target)", () => {
    const decision = classifyModeImport({
      mode: parsed({ name: "spoken-old" }),
      modes: [{ ...spoken, aliases: ["spoken-old"] }, written],
      editRights: "*",
      publishRights: "*",
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toContain("“spoken-old” is an alias of “spoken”");
  });

  it("a mode's own slug listed in its own aliases still resolves to itself", () => {
    // Defensive: the engine never emits this, but a self-alias must not be
    // mistaken for a cross-mode alias collision.
    const decision = classifyModeImport({
      mode: parsed(),
      modes: [{ ...spoken, aliases: ["spoken"] }],
      editRights: "*",
      publishRights: "*",
    });
    expect(decision.kind).toBe("overwrite");
  });
});

describe("classifyModeImport — rights", () => {
  it("wildcard rights create and overwrite freely", () => {
    expect(
      classifyModeImport({
        mode: parsed({ published: true }),
        modes: [],
        editRights: "*",
        publishRights: "*",
      })
    ).toEqual({ kind: "create" });
    expect(
      classifyModeImport({
        mode: parsed({ published: false }),
        modes: [spoken],
        editRights: "*",
        publishRights: "*",
      }).kind
    ).toBe("overwrite");
  });

  it("blocks a CREATE without edit rights on the exact slug (having rights on some other mode is not enough)", () => {
    const decision = classifyModeImport({
      mode: parsed(),
      modes: [written],
      editRights: ["written"],
      publishRights: ["written"],
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toMatch(/permission to create the “spoken” mode/);
  });

  it("blocks an OVERWRITE without edit rights on the slug", () => {
    const decision = classifyModeImport({
      mode: parsed(),
      modes: [spoken],
      editRights: ["written"],
      publishRights: "*",
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toMatch(
      /permission to overwrite the “spoken” mode/
    );
  });

  it("blocks creating a PUBLISHED mode without publish rights", () => {
    const decision = classifyModeImport({
      mode: parsed({ published: true }),
      modes: [],
      editRights: ["spoken"],
      publishRights: [],
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toMatch(/changes the published state/);
  });

  it("creating an UNPUBLISHED mode needs no publish rights", () => {
    expect(
      classifyModeImport({
        mode: parsed({ published: false }),
        modes: [],
        editRights: ["spoken"],
        publishRights: [],
      })
    ).toEqual({ kind: "create" });
  });

  it("blocks an overwrite that FLIPS published without publish rights (both directions)", () => {
    const unpublish = classifyModeImport({
      mode: parsed({ published: false }),
      modes: [{ ...spoken, published: true }],
      editRights: ["spoken"],
      publishRights: [],
    });
    expect(unpublish.kind).toBe("blocked");
    const publish = classifyModeImport({
      mode: parsed({ published: true }),
      modes: [{ ...spoken, published: false }],
      editRights: ["spoken"],
      publishRights: [],
    });
    expect(publish.kind).toBe("blocked");
  });

  it("an overwrite that keeps published unchanged needs only edit rights", () => {
    const decision = classifyModeImport({
      mode: parsed({ published: true }),
      modes: [{ ...spoken, published: true }],
      editRights: ["spoken"],
      publishRights: [],
    });
    expect(decision.kind).toBe("overwrite");
  });

  it("treats an existing row with published ABSENT as unpublished", () => {
    const decision = classifyModeImport({
      mode: parsed({ published: false }),
      modes: [{ name: "spoken", document: "x" }],
      editRights: ["spoken"],
      publishRights: [],
    });
    expect(decision.kind).toBe("overwrite");
  });

  it("checks the alias collision BEFORE rights, so the alias reason wins", () => {
    const decision = classifyModeImport({
      mode: parsed({ name: "spoken-old" }),
      modes: [{ ...spoken, aliases: ["spoken-old"] }],
      editRights: [],
      publishRights: [],
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toMatch(/is an alias of/);
  });
});

// The #308 P2 scenarios: the decision at file-pick and the decision at
// confirm must be computed from the list AS IT IS at each moment. These
// replay the page's own cache writes between the two moments.
describe("classifyModeImport — re-validation across a concurrent mutation", () => {
  const rights = { editRights: "*" as const, publishRights: "*" as const };

  it("a same-slug CREATE landing between pick and confirm turns create into overwrite", () => {
    const atPick: OrgModes = { modes: [written] };
    expect(
      classifyModeImport({ mode: parsed(), modes: atPick.modes, ...rights })
    ).toEqual({ kind: "create" });

    // handleCreateMode / a same-slug import seed the list from the PUT
    // response inside the save hook's onSuccess (saveModeMutationOptions →
    // applyCloneToModeList).
    const created: PromptMode = { name: "spoken", document: "fresh" };
    const atConfirm = applyCloneToModeList(atPick, created)!;
    expect(
      classifyModeImport({ mode: parsed(), modes: atConfirm.modes, ...rights })
    ).toEqual({ kind: "overwrite", existing: created });
  });

  it("a RENAME landing between pick and confirm turns the pending slug into a refused alias", () => {
    const atPick: OrgModes = { modes: [spoken, written] };
    expect(
      classifyModeImport({ mode: parsed(), modes: atPick.modes, ...rights })
        .kind
    ).toBe("overwrite");

    // useRenameMode.onSuccess: the renamed row carries the old slug as an
    // alias (engine alias mechanism, #232).
    const renamed: PromptMode = {
      ...spoken,
      name: "conversation",
      aliases: ["spoken"],
    };
    const atConfirm = applyRenameToModeList(atPick, "spoken", renamed)!;
    const decision = classifyModeImport({
      mode: parsed(),
      modes: atConfirm.modes,
      ...rights,
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toContain("“spoken” is an alias of “conversation”");
  });

  it("a RETIRE landing between pick and confirm turns the pending slug into a refused alias", () => {
    const atPick: OrgModes = { modes: [spoken, written] };
    // useRetireMode.onSuccess: source removed, target widened with the
    // source's slug as an alias.
    const target: PromptMode = { ...written, aliases: ["spoken"] };
    const atConfirm = applyRetireToModeList(atPick, "spoken", target)!;
    const decision = classifyModeImport({
      mode: parsed(),
      modes: atConfirm.modes,
      ...rights,
    });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") return;
    expect(decision.reason).toContain("“spoken” is an alias of “written”");
  });

  it("a DELETE landing between pick and confirm turns overwrite into create (within the confirmed consent)", () => {
    const atPick: OrgModes = { modes: [spoken] };
    expect(
      classifyModeImport({ mode: parsed(), modes: atPick.modes, ...rights })
        .kind
    ).toBe("overwrite");
    expect(
      classifyModeImport({ mode: parsed(), modes: [], ...rights })
    ).toEqual({ kind: "create" });
  });

  it("is a pure function of its inputs (same list → same answer on the second call)", () => {
    const input = { mode: parsed(), modes: [spoken], ...rights };
    expect(classifyModeImport(input)).toEqual(classifyModeImport(input));
  });
});
