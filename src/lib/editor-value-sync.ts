// How `MarkdownEditor` keeps CodeMirror in step with its `value` prop without
// reporting its own bookkeeping back as an edit (#347).
//
// CodeMirror stores every line break as "\n": a document that arrives with
// CRLF (or lone CR) line endings is held, and read back, with LF. The editor
// used to compare its text to `value` byte for byte and to report every
// document change through `onChange`, so a CRLF document:
//
//   1. never matched the editor's text, so it was "replaced" with itself;
//   2. came back through `onChange` as LF, and became the page's draft.
//
// The page then saw a draft that differed from the stored document before the
// user had typed anything. For someone who can edit, autosave rewrote the
// stored document to LF just for opening it. For someone who cannot, the
// draft stayed "unsaved" for good.
//
// Both decisions live here, on `EditorState` alone, so they can be tested
// against real CodeMirror without a DOM.

import {
  Annotation,
  type EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";

/** Marks the transaction that applies the `value` prop to the editor. */
const externalValueSync = Annotation.define<boolean>();

/**
 * The transaction that makes the editor show `value`, or `null` when it
 * already does.
 *
 * "Already does" is judged the way CodeMirror will store the text
 * (`state.toText`, which honours the state's own line-separator setting), not
 * byte for byte: a value that differs from the editor's text only by line
 * endings is the same document to the editor, and replacing it would only
 * reset the cursor and add an undo step.
 */
export function planExternalValueSync(
  state: EditorState,
  value: string
): TransactionSpec | null {
  const shown = state.doc.toString();
  // The typing round trip (onChange → parent → value) lands here on every
  // keystroke with the editor's own text; one string compare settles it.
  if (shown === value) return null;
  if (state.toText(value).toString() === shown) return null;
  return {
    changes: { from: 0, to: state.doc.length, insert: value },
    annotations: externalValueSync.of(true),
  };
}

/**
 * Whether any of these transactions changed the document for a reason other
 * than applying the `value` prop. Only those are edits the parent has not
 * seen; echoing the prop back would hand the parent CodeMirror's LF copy of a
 * document it deliberately holds with its stored line endings.
 */
export function hasUserEdit(transactions: readonly Transaction[]): boolean {
  return transactions.some(
    (tr) => tr.docChanged && tr.annotation(externalValueSync) !== true
  );
}
