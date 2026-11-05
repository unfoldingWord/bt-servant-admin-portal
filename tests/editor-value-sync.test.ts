import { redo, undo } from "@codemirror/commands";
import {
  EditorState,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  editorValueSync,
  hasUserEdit,
  planExternalValueSync,
} from "../src/lib/editor-value-sync";

// #347 — a CRLF mode document looked dirty the moment it loaded. These tests
// drive the two decisions `MarkdownEditor` makes around its `value` prop
// against a real CodeMirror `EditorState` (no DOM needed), because the bug
// lives in CodeMirror's own behaviour: it stores every line break as "\n".

const LF = "# Title\n\nFirst line\n\n## Resources\n\nSecond line\n";
const CRLF = LF.replace(/\n/g, "\r\n");
const CR = LF.replace(/\n/g, "\r");
const MIXED = "# Title\r\n\nFirst line\r\rSecond line\n";

/**
 * Dispatches a plan the way `MarkdownEditor` does: each spec as its own
 * transaction, in order. Returns every transaction and the final state.
 */
function applyPlan(
  state: EditorState,
  plan: readonly TransactionSpec[]
): { state: EditorState; transactions: Transaction[] } {
  const transactions: Transaction[] = [];
  let current = state;
  for (const spec of plan) {
    const tr = current.update(spec);
    transactions.push(tr);
    current = tr.state;
  }
  return { state: current, transactions };
}

/** The final state after applying a plan that must not be null. */
function synced(
  state: EditorState,
  value: string,
  documentKey: string | null = null
): EditorState {
  const plan = planExternalValueSync(state, value, documentKey);
  expect(plan).not.toBeNull();
  return applyPlan(state, plan!).state;
}

/**
 * The parent/editor loop in miniature: the parent hands `value` down, the
 * editor applies it, and a transaction that counts as a user edit is reported
 * back and becomes the parent's new draft.
 */
function handDown(
  state: EditorState,
  value: string
): { state: EditorState; draft: string; dispatched: boolean } {
  const plan = planExternalValueSync(state, value);
  if (plan === null) return { state, draft: value, dispatched: false };
  const applied = applyPlan(state, plan);
  return {
    state: applied.state,
    draft: hasUserEdit(applied.transactions)
      ? applied.state.doc.toString()
      : value,
    dispatched: true,
  };
}

function typeAtEnd(state: EditorState, text: string): Transaction {
  return state.update({
    changes: { from: state.doc.length, insert: text },
    userEvent: "input.type",
  });
}

describe("the premise: CodeMirror stores every line break as LF", () => {
  it.each([
    ["CRLF", CRLF],
    ["lone CR", CR],
    ["mixed", MIXED],
  ])("rewrites a %s document on load", (_name, doc) => {
    const held = EditorState.create({ doc }).doc.toString();
    expect(held).not.toBe(doc);
    expect(held).not.toContain("\r");
  });

  it("rewrites CRLF text inserted by a transaction too", () => {
    const state = EditorState.create({ doc: "" });
    const tr = state.update({ changes: { from: 0, insert: CRLF } });
    expect(tr.state.doc.toString()).toBe(LF);
  });
});

describe("planExternalValueSync", () => {
  it.each([
    ["LF", LF],
    ["CRLF", CRLF],
    ["lone CR", CR],
    ["mixed", MIXED],
  ])("plans nothing when the editor already shows a %s value", (_n, doc) => {
    const state = EditorState.create({ doc });
    expect(planExternalValueSync(state, doc)).toBeNull();
  });

  it("plans nothing when value and editor differ only by line endings", () => {
    expect(
      planExternalValueSync(EditorState.create({ doc: LF }), CRLF)
    ).toBeNull();
  });

  it("replaces the whole document when the value really changed", () => {
    const state = EditorState.create({ doc: "old\r\ntext" });
    expect(synced(state, CRLF).doc.toString()).toBe(LF);
  });

  it("handles the empty document in both directions", () => {
    expect(
      planExternalValueSync(EditorState.create({ doc: "" }), "")
    ).toBeNull();
    const filled = EditorState.create({ doc: LF });
    expect(synced(filled, "").doc.length).toBe(0);
    const empty = EditorState.create({ doc: "" });
    expect(synced(empty, CRLF).doc.toString()).toBe(LF);
  });
});

describe("hasUserEdit", () => {
  it("does not count the editor applying its own value prop", () => {
    const state = EditorState.create({ doc: "old" });
    const { transactions } = applyPlan(
      state,
      planExternalValueSync(state, CRLF)!
    );
    expect(transactions.some((tr) => tr.docChanged)).toBe(true);
    expect(hasUserEdit(transactions)).toBe(false);
  });

  it("counts typing", () => {
    const state = EditorState.create({ doc: CRLF });
    expect(hasUserEdit([typeAtEnd(state, "x")])).toBe(true);
  });

  it("counts any other document change, such as undo or a command", () => {
    const state = EditorState.create({ doc: LF });
    const tr = state.update({ changes: { from: 0, to: 1 } });
    expect(hasUserEdit([tr])).toBe(true);
  });

  it("does not count a transaction that leaves the document alone", () => {
    const state = EditorState.create({ doc: LF });
    expect(hasUserEdit([state.update({ selection: { anchor: 3 } })])).toBe(
      false
    );
    expect(hasUserEdit([])).toBe(false);
  });

  it("counts a batch that holds an edit beside a value sync", () => {
    const state = EditorState.create({ doc: "old" });
    const sync = applyPlan(state, planExternalValueSync(state, LF)!);
    const typed = typeAtEnd(sync.state, "x");
    expect(hasUserEdit([...sync.transactions, typed])).toBe(true);
  });
});

describe("a document keeps its stored bytes until the user edits it", () => {
  it.each([
    ["CRLF", CRLF],
    ["lone CR", CR],
    ["mixed", MIXED],
    ["LF", LF],
  ])("loading a %s document leaves the draft identical", (_name, stored) => {
    // The editor mounts empty, then the page hands the loaded document down.
    const loaded = handDown(EditorState.create({ doc: "" }), stored);
    expect(loaded.dispatched).toBe(true);
    expect(loaded.draft).toBe(stored);
    // A re-render with the same value is a no-op.
    const again = handDown(loaded.state, loaded.draft);
    expect(again.dispatched).toBe(false);
    expect(again.draft).toBe(stored);
  });

  it("a page-driven replace (priorities Apply) keeps its CRLF bytes", () => {
    const loaded = handDown(EditorState.create({ doc: "" }), CRLF);
    const applied = `${CRLF}\r\n<!-- order: ["a"] -->\r\n`;
    const next = handDown(loaded.state, applied);
    expect(next.dispatched).toBe(true);
    expect(next.draft).toBe(applied);
    expect(next.state.doc.toString()).toBe(applied.replace(/\r\n/g, "\n"));
  });

  it("a real edit is still reported, as the editor's LF text", () => {
    const loaded = handDown(EditorState.create({ doc: "" }), CRLF);
    const tr = typeAtEnd(loaded.state, "x");
    expect(hasUserEdit([tr])).toBe(true);
    expect(tr.state.doc.toString()).toBe(`${LF}x`);
    // The page stores that text as the draft; handing it back is a no-op.
    expect(planExternalValueSync(tr.state, `${LF}x`)).toBeNull();
  });
});

// #349 — Ctrl+Z straight after a mode loaded undid the load: the editor went
// back to what it held before the value arrived, the undo counted as a user
// edit, and autosave sent it. The page mounts the editor before it hands the
// loaded document down, so "before" is the empty string on a first open and
// the previous mode's draft after a switch.

const MODE_A = "# Mode A\n\nAlpha instructions\n";
const MODE_B = "# Mode B\n\nBeta instructions\n";

/**
 * The editor's own state: history in the compartment the plan resets, opened
 * on the document named `documentKey`.
 */
function editorState(
  doc: string,
  documentKey: string | null = null
): EditorState {
  return EditorState.create({
    doc,
    extensions: [editorValueSync(documentKey)],
  });
}

/**
 * Runs an undo (or redo) command and reports what the page would see: the
 * resulting state, whether the command did anything, and the text handed to
 * `onChange` if the command counted as a user edit.
 */
function press(
  command: typeof undo,
  state: EditorState
): { state: EditorState; ran: boolean; reported: string | null } {
  let next = state;
  let reported: string | null = null;
  const ran = command({
    state,
    dispatch: (tr) => {
      if (hasUserEdit([tr])) reported = tr.state.doc.toString();
      next = tr.state;
    },
  });
  return { state: next, ran, reported };
}

describe("applying the value prop cannot be undone (#349)", () => {
  it("Ctrl+Z right after the first load does nothing", () => {
    const loaded = synced(editorState(""), MODE_B);
    const z = press(undo, loaded);
    expect(z.ran).toBe(false);
    expect(z.reported).toBeNull();
    expect(z.state.doc.toString()).toBe(MODE_B);
  });

  it("Ctrl+Z after a switch never brings back the other mode's text", () => {
    // The editor holds A, with an edit of the user's in its history, when B
    // is handed down (the cached-mode switch keeps the editor mounted; an
    // uncached one remounts it on A's stale draft).
    const typed = typeAtEnd(
      synced(editorState("", "A"), MODE_A, "A"),
      "more"
    ).state;
    const switched = synced(typed, MODE_B, "B");
    const z = press(undo, switched);
    expect(z.ran).toBe(false);
    expect(z.reported).toBeNull();
    expect(z.state.doc.toString()).toBe(MODE_B);
  });

  it("a deletion made in the previous mode is not spliced into the new one", () => {
    // Why the history is reset, not only bypassed: with addToHistory(false)
    // alone, this deletion is mapped through the whole-document replace and
    // undo re-inserts "Alpha instructions" into mode B.
    const loadedA = synced(editorState("", "A"), MODE_A, "A");
    const from = MODE_A.indexOf("Alpha");
    const deleted = loadedA.update({
      changes: { from, to: from + "Alpha instructions".length },
      userEvent: "delete",
    }).state;
    const switched = synced(deleted, MODE_B, "B");
    const z = press(undo, switched);
    expect(z.ran).toBe(false);
    expect(z.reported).toBeNull();
    expect(z.state.doc.toString()).toBe(MODE_B);
  });

  it("an editor mounted on the previous mode's draft cannot undo to it", () => {
    // Mounted while B is selected, before B's draft arrives.
    const z = press(undo, synced(editorState(MODE_A, "B"), MODE_B, "B"));
    expect(z.ran).toBe(false);
    expect(z.state.doc.toString()).toBe(MODE_B);
  });

  it("edits after a load still undo, back to the loaded text and no further", () => {
    const loaded = synced(editorState(""), MODE_B);
    const typed = typeAtEnd(loaded, "x").state;
    const first = press(undo, typed);
    expect(first.ran).toBe(true);
    expect(first.reported).toBe(MODE_B);
    expect(first.state.doc.toString()).toBe(MODE_B);
    expect(press(undo, first.state).ran).toBe(false);
    // Redo still works within the fresh history.
    expect(press(redo, first.state).state.doc.toString()).toBe(`${MODE_B}x`);
  });

  it("a page-driven replace of the open document (priorities Apply) is not undoable", () => {
    // Decision recorded in #349: an Apply is saved by its own PUT, and a
    // Ctrl+Z that reverted it would autosave the pre-Apply document.
    const loaded = synced(editorState(""), MODE_B);
    const applied = synced(loaded, `${MODE_B}\n<!-- order: ["a"] -->\n`);
    const z = press(undo, applied);
    expect(z.ran).toBe(false);
    expect(z.reported).toBeNull();
  });

  it("re-rendering with the shown value leaves the history alone", () => {
    const typed = typeAtEnd(synced(editorState(""), MODE_B), "x").state;
    expect(planExternalValueSync(typed, `${MODE_B}x`)).toBeNull();
    expect(press(undo, typed).state.doc.toString()).toBe(MODE_B);
  });
});

// Bench round 2 on #349 — the reset above runs only when the text changes.
// Two documents can hold the same text: edit A from OLD to SHARED, switch to
// B, whose stored text is SHARED, and nothing on screen changes. Without a
// document identity the history still held A's edit, and Ctrl+Z wrote OLD
// into B, where autosave saved it.

const OLD = "# Shared\n\nOld wording\n";
const SHARED = "# Shared\n\nNew wording\n";

/** Mode A, loaded as OLD and edited by the user to SHARED. */
function editedA(): EditorState {
  const loaded = synced(editorState("", "A"), OLD, "A");
  const from = OLD.indexOf("Old");
  return loaded.update({
    changes: { from, to: from + "Old".length, insert: "New" },
    userEvent: "input.type",
  }).state;
}

describe("a switch onto a document with the same text (#349)", () => {
  it("resets the history: Ctrl+Z cannot write A's text into B", () => {
    const a = editedA();
    expect(a.doc.toString()).toBe(SHARED);
    const plan = planExternalValueSync(a, SHARED, "B");
    expect(plan).not.toBeNull();
    const switched = applyPlan(a, plan!);
    expect(switched.transactions.some((tr) => tr.docChanged)).toBe(false);
    expect(hasUserEdit(switched.transactions)).toBe(false);
    const z = press(undo, switched.state);
    expect(z.ran).toBe(false);
    expect(z.reported).toBeNull();
    expect(z.state.doc.toString()).toBe(SHARED);
  });

  it("an echo of the same document's text keeps its history", () => {
    const a = editedA();
    expect(planExternalValueSync(a, SHARED, "A")).toBeNull();
    const z = press(undo, a);
    expect(z.ran).toBe(true);
    expect(z.reported).toBe(OLD);
  });

  it("text equal only up to line endings counts as the same text", () => {
    const a = editedA();
    const crlf = SHARED.replace(/\n/g, "\r\n");
    expect(planExternalValueSync(a, crlf, "A")).toBeNull();
    const switched = synced(a, crlf, "B");
    expect(press(undo, switched).ran).toBe(false);
  });

  it("the identity sticks: B's later echoes keep B's own history", () => {
    const b = synced(editedA(), SHARED, "B");
    const typed = typeAtEnd(b, "x").state;
    expect(planExternalValueSync(typed, `${SHARED}x`, "B")).toBeNull();
    expect(press(undo, typed).reported).toBe(SHARED);
  });

  it("marks both transactions of every plan as the sync, outside history", () => {
    // A key-only reset, and a text change within the same document.
    for (const [state, value, key] of [
      [editedA(), SHARED, "B"],
      [editorState(OLD, "A"), SHARED, "A"],
    ] as const) {
      const plan = planExternalValueSync(state, value, key);
      expect(plan).toHaveLength(2);
      const { transactions } = applyPlan(state, plan!);
      for (const tr of transactions) {
        expect(tr.annotation(Transaction.addToHistory)).toBe(false);
      }
      expect(hasUserEdit(transactions)).toBe(false);
    }
  });
});
