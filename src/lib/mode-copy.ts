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
