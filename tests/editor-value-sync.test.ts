import { EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
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
 * The parent/editor loop in miniature: the parent hands `value` down, the
 * editor applies it, and a transaction that counts as a user edit is reported
 * back and becomes the parent's new draft.
 */
function handDown(
  state: EditorState,
  value: string
): { state: EditorState; draft: string; dispatched: boolean } {
  const spec = planExternalValueSync(state, value);
  if (spec === null) return { state, draft: value, dispatched: false };
  const tr = state.update(spec);
  return {
    state: tr.state,
    draft: hasUserEdit([tr]) ? tr.state.doc.toString() : value,
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
    const spec = planExternalValueSync(state, CRLF);
    expect(spec).not.toBeNull();
    expect(state.update(spec!).state.doc.toString()).toBe(LF);
  });

  it("handles the empty document in both directions", () => {
    expect(
      planExternalValueSync(EditorState.create({ doc: "" }), "")
    ).toBeNull();
    const filled = EditorState.create({ doc: LF });
    expect(
      filled.update(planExternalValueSync(filled, "")!).state.doc.length
    ).toBe(0);
    const empty = EditorState.create({ doc: "" });
    expect(
      empty.update(planExternalValueSync(empty, CRLF)!).state.doc.toString()
    ).toBe(LF);
  });
});

describe("hasUserEdit", () => {
  it("does not count the editor applying its own value prop", () => {
    const state = EditorState.create({ doc: "old" });
    const tr = state.update(planExternalValueSync(state, CRLF)!);
    expect(tr.docChanged).toBe(true);
    expect(hasUserEdit([tr])).toBe(false);
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
    const sync = state.update(planExternalValueSync(state, LF)!);
    const typed = typeAtEnd(sync.state, "x");
    expect(hasUserEdit([sync, typed])).toBe(true);
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
