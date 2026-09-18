// Sentences that more than one mode surface has to say identically.
//
// Both of these were literal copies in three-to-six places (the Modes page,
// the resource-priority panel, and now the details panel). A denial the user
// meets on the toolbar, inside a sheet, and in a tooltip has to read the same
// every time, or it stops sounding like one rule. Reworded here, reworded
// everywhere.
//
// Scoped to modes on purpose: the languages editor says "on this language"
// and owns its own string.

/** Missing per-row edit rights. Mirrors the worker's verb gate. */
export const NO_EDIT_RIGHTS_REASON = "You don't have edit rights on this mode.";

/**
 * Another mode PUT is already in flight. Every save path on the Modes page
 * shares one synchronous lock (`inFlightSavesRef`), because each PUT carries
 * the whole document and a second one would ship a pre-flight copy over it.
 */
export const SAVE_IN_FLIGHT_REASON =
  "Another save is in flight. Try again in a moment.";

/**
 * #337 — the Details sheet opens only on a saved document: its PUT carries
 * the whole document, so on a rejected draft it would fail with the
 * document's error and invite a retry, and on an untried one it would
 * persist the draft as a side effect. Worded like the other dirty-gated
 * controls; the editor's own "Save failed" banner says what was rejected.
 */
export const DOCUMENT_UNSAVED_REASON =
  "Save your changes before editing the details.";

/**
 * A gated header control's help text: its base description, plus the reason
 * it is gated off when there is one — for the controls that append the
 * reason to their description rather than replace it.
 */
export function gatedHelp(help: string, reason: string | null): string {
  return reason ? `${help} ${reason}` : help;
}
