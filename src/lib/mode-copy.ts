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

/**
 * #344 — the same rule as the Details opener (#337), for the other header
 * controls whose PUT carries the editor's draft: Publish / Unpublish, the
 * Requires-group switch, and the Resource-priorities opener. On a rejected
 * draft each would fail with the document's error; on an untried one it
 * would persist the draft as a side effect. Recovery is the editor's own
 * Save (or fixing the document), not re-sending it through a toggle.
 */
export const PUBLISH_UNSAVED_REASON =
  "Save your changes before publishing or unpublishing.";
export const REQUIRES_GROUP_UNSAVED_REASON =
  "Save your changes before changing the group-chat setting.";
export const RESOURCE_PRIORITIES_UNSAVED_REASON =
  "Save your changes before ranking resources.";

/**
 * Why a control that sends the editor's draft is gated off, or null when it
 * is not: a save in flight, else an unsaved draft, worded for that control.
 * In flight outranks dirty: an autosave that lands makes the draft clean.
 */
export function describeDraftCarryingBlock(
  gate: {
    /** A save is in flight somewhere on the page. */
    isSaving: boolean;
    /** The editor's draft differs from what the server holds. */
    isDirty: boolean;
  },
  unsavedReason: string
): string | null {
  if (gate.isSaving) return SAVE_IN_FLIGHT_REASON;
  if (gate.isDirty) return unsavedReason;
  return null;
}
