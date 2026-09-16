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
 * #337 — the editor's draft is unsaved and its last save was rejected. Every
 * mode PUT carries the whole document, so a details save would re-send that
 * same draft and fail the same way. Said at the Details opener and, as a
 * backstop, inside the sheet, so it names the route that resolves it: the
 * editor's own Save, which sends the draft again (a transient failure needs
 * nothing more; a rejected one needs the edits fixed or undone first).
 */
export const DOCUMENT_UNSAVED_REASON =
  "The mode document hasn't been saved. Save it from the editor first — fixing or undoing your edits if it was rejected — before changing the details.";

/**
 * A gated header control's help text: its base description, plus the reason
 * it is gated off when there is one. One separator for every such control,
 * so the title and the sr-only help read alike across the toolbar.
 */
export function gatedHelp(help: string, reason: string | null): string {
  return reason ? `${help} ${reason}` : help;
}
