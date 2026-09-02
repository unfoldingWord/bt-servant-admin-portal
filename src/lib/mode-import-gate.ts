// Pre-PUT gate for the Modes page's "Import Config" action (#198 / #308).
// Lifted out of the page so the rule is stated once and tested directly,
// same shape as `autosave-gate`, `mutation-ownership`, and `language-create`.
//
// The gate answers one question: given the parsed file and the LIVE org mode
// list, may this import PUT right now — and is it a create or an overwrite?
// It is deliberately a pure function of its inputs so the page can run it at
// BOTH decision points with the same semantics:
//
//   1. at file-select, after `file.text()` resolves, and
//   2. again at overwrite-confirm, before `runImport`.
//
// Running it twice is the #308 fix. The original #306 flow computed the
// collision / alias / rights / publish-diff once, from the render closure's
// `modesQuery.data`, and PUT from the confirm dialog with no second lookup.
// Any mode mutation that COMPLETES while the OS picker or the confirm dialog
// is open (this client's own seeds, or another admin's write landing through a
// refetch) can change the answer: a fresh create of the same slug turns a
// "create" into a silent clobber, and a rename/retire can turn the slug into
// an ALIAS — which the engine resolves on PUT (`findModeBySlug`), so the write
// would land on a DIFFERENT canonical mode with no confirmation.

import type { LanguageRights } from "@/types/auth";
import type { PromptMode } from "@/types/prompt-override";

import type { ParsedModeImport } from "@/lib/mode-import";
import { hasRights } from "@/lib/permissions";

export interface ModeImportGateInput {
  /** The parsed, validated file. */
  mode: ParsedModeImport;
  /**
   * The LIVE org mode list — the FULL list, not the rights-filtered subset,
   * so a hidden collision is still caught. `undefined` means "not loaded":
   * the gate fails CLOSED, because an empty list would classify an existing
   * mode as new and overwrite it with no confirmation.
   */
  modes: readonly PromptMode[] | undefined;
  /** Effective edit rights (`"*"` for admin / cross-org). */
  editRights: LanguageRights | undefined;
  /** Effective publish rights (`"*"` for admin / cross-org). */
  publishRights: LanguageRights | undefined;
}

export type ModeImportDecision =
  /** The slug is not in the list: PUT creates it. */
  | { kind: "create" }
  /** The slug is a canonical mode: PUT overwrites `existing` (confirm first). */
  | { kind: "overwrite"; existing: PromptMode }
  /** Refuse; `reason` is user-facing copy. */
  | { kind: "blocked"; reason: string };

/**
 * Decide whether an import may PUT, and whether it creates or overwrites.
 * Pure — call it against the live list at every decision point.
 */
export function classifyModeImport({
  mode,
  modes,
  editRights,
  publishRights,
}: ModeImportGateInput): ModeImportDecision {
  if (modes === undefined) {
    return {
      kind: "blocked",
      reason: "The mode list is still loading — try again in a moment.",
    };
  }

  const name = mode.name;
  // Resolve by canonical name AND aliases. A PUT addressed to an alias
  // mutates the aliased-TO mode, so an import whose name is a stale/retired
  // slug must be refused and pointed at the canonical slug (codex+grok #306
  // rd-2; re-checked at confirm for #308).
  const collision = modes.find(
    (m) => m.name === name || m.aliases?.includes(name) === true
  );
  if (collision !== undefined && collision.name !== name) {
    return {
      kind: "blocked",
      reason: `“${name}” is an alias of “${collision.name}” — import against the canonical slug.`,
    };
  }
  const exists = collision !== undefined;

  // Edit rights on the TARGET slug are required whether creating or
  // overwriting: the worker early-denies any caller with no rights on the
  // exact name (admins and cross-org carry "*"), so "has a right on SOME
  // mode" is not sufficient for a new slug (codex #306 rd-2).
  if (!hasRights(editRights, name)) {
    return {
      kind: "blocked",
      reason: exists
        ? `You don't have permission to overwrite the “${name}” mode.`
        : `You don't have permission to create the “${name}” mode. Creating a new mode needs edit rights on that slug (admin or a wildcard grant).`,
    };
  }

  // Publishing additionally needs publish rights — the worker's diff gate
  // requires the `publish` verb when creating a published mode OR flipping an
  // existing one's flag, so a user without it would hit a bare 403 after
  // confirming (codex+grok #306 rd-2/3). A create sets published from
  // false→its value; an overwrite is a change only when the flag differs.
  const publishChanges =
    collision !== undefined
      ? mode.published !== (collision.published ?? false)
      : mode.published;
  if (publishChanges && !hasRights(publishRights, name)) {
    return {
      kind: "blocked",
      reason: `This import changes the published state of “${name}”, which needs publish rights you don't have on it.`,
    };
  }

  return collision !== undefined
    ? { kind: "overwrite", existing: collision }
    : { kind: "create" };
}
