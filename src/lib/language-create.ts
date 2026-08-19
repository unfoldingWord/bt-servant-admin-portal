import type { LanguageRights } from "@/types/auth";
import { hasRights } from "@/lib/permissions";

/**
 * What a create-language request should do for a given slug.
 *
 * Background (#293): creating a language PUTs a blank scaffold with
 * `published: false`. #272 removed the last create-time collision guard, so a
 * slug that already existed fell straight through to that PUT — silently
 * overwriting the language's tuning document and unpublishing it, with no
 * confirmation and no undo. #249 makes the dropdown list the org's whole
 * catalog, so a taken name is always one the caller can SEE; whether they may
 * overwrite it is a question of edit rights, not visibility.
 */
export type LanguageCreateAction =
  /** Slug is free — create it. */
  | { kind: "create" }
  /**
   * Slug exists and the caller holds no edit right on it. The worker would
   * 403 the overwrite PUT, so refuse up front rather than offer a destructive
   * confirmation that can only fail.
   */
  | { kind: "blocked" }
  /**
   * Slug exists and the caller may overwrite it. Creating replaces the
   * document with a blank scaffold and unpublishes it, so confirm first.
   */
  | { kind: "confirm" };

/**
 * Decide what a create-language request should do for `slug`.
 *
 * `editRights` is already trump-aware (`"*"` for admins and cross-org
 * super-admins), so admins re-creating any existing language get `confirm`,
 * never `blocked`. `undefined` is the legacy "full access by default" shape and
 * behaves the same as `"*"` here (see `hasRights`). The worker's gate remains
 * the enforcement either way; this only decides the client-side affordance.
 */
export function classifyLanguageCreate(
  slug: string,
  existingNames: readonly string[],
  editRights: LanguageRights | undefined
): LanguageCreateAction {
  if (!existingNames.includes(slug)) return { kind: "create" };
  if (!hasRights(editRights, slug)) return { kind: "blocked" };
  return { kind: "confirm" };
}
