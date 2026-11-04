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
// Applying `value` also starts a new undo history (#349). The transaction
// that applies it used to be an ordinary undoable change, so Ctrl+Z straight
// after a mode loaded undid the load itself: the editor went back to what it
// held before (empty on first open, the previous mode's text after a switch),
// that undo was a user edit, and autosave sent it as the new document.
//
// All three decisions live here, on `EditorState` alone, so they can be
// tested against real CodeMirror without a DOM.

import { history } from "@codemirror/commands";
import {
  Annotation,
  Compartment,
  Transaction,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";

/** Marks the transaction that applies the `value` prop to the editor. */
const externalValueSync = Annotation.define<boolean>();

/**
 * Holds the editor's undo history, so a value sync can drop it and start a
 * fresh one. A compartment is a key, not state: one instance serves every
 * editor, each holding its own history inside it.
 */
const historyCompartment = new Compartment();

/**
 * The undo history extension for an editor whose `value` is synced through
 * `planExternalValueSync`. Use it in place of a bare `history()`: the reset
 * the plan performs only reaches a history held in this compartment.
 */
export function editorHistory(): Extension {
  return historyCompartment.of(history());
}

/**
 * The transactions that make the editor show `value`, to be dispatched in
 * order, or `null` when it already does.
 *
 * Applying `value` is not an edit the user can undo. The first transaction
 * replaces the document outside the history and removes the history; the
 * second puts back an empty one. Removing it, and not only keeping this one
 * change out of it, matters: older entries would otherwise be mapped through
 * a whole-document replace, and undoing one could put the previous
 * document's text back into the new one. Edits made after the sync undo as
 * usual, back to `value` and no further.
 *
 * The same holds when the page replaces the document it already shows (a
 * resource-priorities Apply, an import of the open mode): both are saved by
 * their own PUT, and Ctrl+Z does not take them back.
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
): readonly TransactionSpec[] | null {
  // The typing round trip (onChange → parent → value) lands here on every
  // keystroke with the editor's own text; one string compare settles it.
  if (state.doc.toString() === value) return null;
  const next = state.toText(value);
  if (next.eq(state.doc)) return null;
  return [
    {
      changes: { from: 0, to: state.doc.length, insert: next },
      annotations: [
        externalValueSync.of(true),
        Transaction.addToHistory.of(false),
      ],
      effects: historyCompartment.reconfigure([]),
    },
    { effects: historyCompartment.reconfigure(history()) },
  ];
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
