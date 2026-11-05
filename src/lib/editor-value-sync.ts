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
  StateEffect,
  StateField,
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
 * Which document the editor's undo history belongs to (#349, bench round 2).
 * Text alone cannot say: two modes can hold the same text, and a switch
 * between them changes nothing on screen while the history still holds the
 * first mode's edits.
 */
const setDocumentKey = StateEffect.define<string | null>();
const documentKeyField = StateField.define<string | null>({
  create: () => null,
  update(key, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDocumentKey)) key = effect.value;
    }
    return key;
  },
});

/**
 * The undo history and document identity for an editor whose `value` is
 * synced through `planExternalValueSync`, opened on the document named
 * `documentKey`. Use it in place of a bare `history()`: the reset the plan
 * performs only reaches a history held here.
 */
export function editorValueSync(documentKey: string | null): Extension {
  return [
    historyCompartment.of(makeHistory()),
    documentKeyField.init(() => documentKey),
  ];
}

/**
 * The one history configuration. Both the editor's first history and the
 * fresh one a value sync puts back come from here, so they cannot drift.
 */
function makeHistory(): Extension {
  return history();
}

/** Both transactions of a plan carry these: neither is the user's edit. */
const SYNC_ANNOTATIONS = [
  externalValueSync.of(true),
  Transaction.addToHistory.of(false),
];

/**
 * The transactions that make the editor show `value` as the document named
 * `documentKey`, to be dispatched in order, or `null` when it already does.
 *
 * Applying `value` is not an edit the user can undo. The first transaction
 * replaces the document outside the history and removes the history; the
 * second puts back an empty one. Removing it, and not only keeping this one
 * change out of it, matters: older entries would otherwise be mapped through
 * a whole-document replace, and undoing one could put the previous
 * document's text back into the new one. Edits made after the sync undo as
 * usual, back to `value` and no further.
 *
 * A change of `documentKey` resets the history even when the text is
 * already on screen: after a switch between two documents with the same
 * text, the history would otherwise still hold the first one's edits, and
 * Ctrl+Z would write them into the second. For the same document, a value
 * the editor already shows (the typing round trip) plans nothing and keeps
 * the history.
 *
 * Replacing the text of the same document (a resource-priorities Apply, an
 * import of the open mode) also resets it: both are saved by their own PUT,
 * and Ctrl+Z does not take them back.
 *
 * "Already shows" is judged the way CodeMirror will store the text
 * (`state.toText`, which honours the state's own line-separator setting), not
 * byte for byte: a value that differs from the editor's text only by line
 * endings is the same text to the editor.
 *
 * An editor without `editorValueSync` tracks no identity; only text changes
 * reset it.
 */
export function planExternalValueSync(
  state: EditorState,
  value: string,
  documentKey: string | null = null
): readonly TransactionSpec[] | null {
  const heldKey = state.field(documentKeyField, false);
  const sameDocument = heldKey === undefined || heldKey === documentKey;
  // The typing round trip (onChange → parent → value) lands here on every
  // keystroke with the editor's own text; one string compare settles it.
  const next = state.doc.toString() === value ? null : state.toText(value);
  // The text to put in, or null when the editor already shows `value`.
  const replacement = next !== null && !next.eq(state.doc) ? next : null;
  if (replacement === null && sameDocument) return null;
  return [
    {
      changes:
        replacement === null
          ? undefined
          : { from: 0, to: state.doc.length, insert: replacement },
      annotations: SYNC_ANNOTATIONS,
      effects: [
        historyCompartment.reconfigure([]),
        ...(sameDocument ? [] : [setDocumentKey.of(documentKey)]),
      ],
    },
    {
      annotations: SYNC_ANNOTATIONS,
      effects: historyCompartment.reconfigure(makeHistory()),
    },
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
