import {
  MAX_MODE_DESCRIPTION_LENGTH,
  MAX_MODE_WELCOME_MESSAGE_LENGTH,
} from "@/types/prompt-override";

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

/** The PUT body fragment the page sends — undefined means "leave as is". */
export interface ModeDetailsBody {
  description?: string;
  welcome_message?: string;
}

export type ModeDetailsField = keyof ModeDetails;

export const MODE_DETAILS_LIMITS: Record<ModeDetailsField, number> = {
  description: MAX_MODE_DESCRIPTION_LENGTH,
  welcomeMessage: MAX_MODE_WELCOME_MESSAGE_LENGTH,
};

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
 * The first field over its worker cap, or null. `maxLength` on the textareas
 * already prevents typing past the cap; this is the backstop for pasted or
 * programmatic values, and mirrors the hard 400 the worker would return.
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
