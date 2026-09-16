import {
  MAX_MODE_DESCRIPTION_LENGTH,
  MAX_MODE_WELCOME_MESSAGE_LENGTH,
} from "@/types/prompt-override";
import {
  DOCUMENT_UNSAVED_REASON,
  NO_EDIT_RIGHTS_REASON,
  SAVE_IN_FLIGHT_REASON,
} from "@/lib/mode-copy";

// #328 — editing an existing mode's description and first-contact welcome.
//
// The worker has no partial update and one clear convention for both
// fields: an omitted key keeps the stored value, an empty string deletes it
// (`description` is deleted by '' only; `welcome_message` by '' or null —
// worker `mergeExistingMode`). This module is the one place that knows those
// rules, so the panel renders and the page saves without re-deriving them.

/** What the panel edits: both fields as strings, empty meaning "not set". */
export interface ModeDetails {
  description: string;
  welcomeMessage: string;
}

/** The subset of the stored mode the details panel reads. */
export interface StoredModeDetails {
  description?: string;
  welcome_message?: string;
}

/**
 * The PUT body fragment the page sends — an absent key means "leave as is".
 * Same shape as what is stored, deliberately aliased rather than re-declared
 * so the two cannot drift into silently-assignable-one-way twins.
 */
export type ModeDetailsBody = StoredModeDetails;

export type ModeDetailsField = keyof ModeDetails;

export const MODE_DETAILS_LIMITS: Record<ModeDetailsField, number> = {
  description: MAX_MODE_DESCRIPTION_LENGTH,
  welcomeMessage: MAX_MODE_WELCOME_MESSAGE_LENGTH,
};

/** How each field is named to the user, for messages that mention one. */
const FIELD_NOUN: Record<ModeDetailsField, string> = {
  description: "description",
  welcomeMessage: "welcome message",
};

/** Why Save is unavailable. `kind` is for layout decisions, `message` for people. */
export interface ModeDetailsSaveBlock {
  kind: "rights" | "busy" | "document" | "limit" | "unchanged";
  message: string;
}

/** Everything that can stop a details save, as the panel knows it. */
export interface ModeDetailsSaveGate {
  canEdit: boolean;
  /** A save is in flight, here or elsewhere on the page. */
  busy: boolean;
  /**
   * The editor's draft is unsaved and its last save failed (#337). A details
   * save would carry that draft verbatim, so it is refused up front rather
   * than failing with the document's error and inviting a retry.
   */
  documentUnsaved: boolean;
  changed: boolean;
  overLimit: ModeDetailsField | null;
  /** A previous save failed and has not been resolved. */
  hasSaveError: boolean;
}

/**
 * Why Save is unavailable, or null when it is available.
 *
 * Ordered most-fundamental first, so a user without edit rights is told THAT
 * rather than "nothing has changed". A rejected document outranks a field
 * cap, because no edit inside the sheet can clear it. `changed` stops
 * blocking once a save has failed: the form still holds the edit the user
 * wants, so "nothing has changed" would be precisely backwards on the retry
 * path.
 */
export function describeModeDetailsSaveBlock(
  gate: ModeDetailsSaveGate
): ModeDetailsSaveBlock | null {
  if (!gate.canEdit) return { kind: "rights", message: NO_EDIT_RIGHTS_REASON };
  if (gate.busy) return { kind: "busy", message: SAVE_IN_FLIGHT_REASON };
  if (gate.documentUnsaved) {
    return { kind: "document", message: DOCUMENT_UNSAVED_REASON };
  }
  if (gate.overLimit) {
    return {
      kind: "limit",
      message: `The ${FIELD_NOUN[gate.overLimit]} is over ${MODE_DETAILS_LIMITS[gate.overLimit]} characters.`,
    };
  }
  if (!gate.changed && !gate.hasSaveError) {
    return { kind: "unchanged", message: "Nothing has changed." };
  }
  return null;
}

/** Stored → form. An unset field reads as empty. */
export function modeDetailsFromStored(
  stored: StoredModeDetails | undefined
): ModeDetails {
  return {
    description: stored?.description ?? "",
    welcomeMessage: stored?.welcome_message ?? "",
  };
}

/** Form → the value that would be stored. Whitespace-only is "not set". */
export function normalizeModeDetails(input: ModeDetails): ModeDetails {
  return {
    description: input.description.trim(),
    welcomeMessage: input.welcomeMessage.trim(),
  };
}

/**
 * Whether saving `input` would change what is stored. Compared against the
 * RAW stored value on purpose: the question is "will the wire value differ",
 * not "does it look different", so a stored value with stray whitespace can
 * still be cleaned up by saving.
 */
export function modeDetailsChanged(
  stored: StoredModeDetails | undefined,
  input: ModeDetails
): boolean {
  const next = normalizeModeDetails(input);
  const current = modeDetailsFromStored(stored);
  return (
    next.description !== current.description ||
    next.welcomeMessage !== current.welcomeMessage
  );
}

/**
 * The first field over its worker cap, or null. Browsers enforce `maxLength`
 * on typing AND on paste, so the reachable case is a STORED value already
 * over the cap — one written before the cap existed, or by import. Without
 * this the panel would offer Save on a value the worker answers with a 400.
 */
export function modeDetailsOverLimit(
  input: ModeDetails
): ModeDetailsField | null {
  const next = normalizeModeDetails(input);
  if (next.description.length > MODE_DETAILS_LIMITS.description) {
    return "description";
  }
  if (next.welcomeMessage.length > MODE_DETAILS_LIMITS.welcomeMessage) {
    return "welcomeMessage";
  }
  return null;
}

/**
 * The PUT body fragment for a details save.
 *
 * - A non-empty field is sent as its trimmed value.
 * - An empty field whose stored value is set is sent as '' — that is the
 *   worker's delete signal for BOTH fields (`null` would clear the welcome
 *   but is a no-op for the description).
 * - An empty field that was never set is OMITTED, so the request carries no
 *   spurious "change" for the BFF's verb diff to charge edit rights for.
 */
export function toModeDetailsBody(
  stored: StoredModeDetails | undefined,
  input: ModeDetails
): ModeDetailsBody {
  const next = normalizeModeDetails(input);
  const body: ModeDetailsBody = {};
  if (next.description !== "") {
    body.description = next.description;
  } else if (stored?.description !== undefined) {
    body.description = "";
  }
  if (next.welcomeMessage !== "") {
    body.welcome_message = next.welcomeMessage;
  } else if (stored?.welcome_message !== undefined) {
    body.welcome_message = "";
  }
  return body;
}
