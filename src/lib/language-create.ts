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
   * Slug exists and the caller can't legally overwrite it, so the worker would
   * 403 the PUT — refuse up front rather than offer a confirmation that only
   * fails. `reason` distinguishes the missing verb for the copy: `"edit"` (no
   * edit right at all) vs `"publish"` (a PUBLISHED target, which the overwrite
   * would unpublish, needs the publish verb too).
   */
  | { kind: "blocked"; reason: "edit" | "publish" }
  /**
   * Slug exists and the caller may overwrite it. Creating replaces the
   * document with a blank scaffold and unpublishes it, so confirm first.
   */
  | { kind: "confirm" };

/** The existing language a `slug` collides with, or `null` when the slug is free. */
export interface ExistingLanguage {
  /** Whether the colliding row is currently published. */
  published: boolean;
}

/**
 * Decide what a create-language request should do for `slug`.
 *
 * Re-creating an existing language PUTs a blank scaffold with `published:
 * false`. The worker derives the required verbs from what changes: the blank
 * document always needs `edit`, and flipping a PUBLISHED row to unpublished
 * also needs `publish`. So overwriting a published row the caller can edit but
 * not publish would 403 — this returns `blocked/"publish"` for that case
 * instead of a confirmation that can't succeed. Overwriting a draft needs only
 * `edit`.
 *
 * Both rights args are already trump-aware (`"*"` for admins and cross-org
 * super-admins; `undefined` is the legacy full-access shape — see `hasRights`),
 * so admins always reach `confirm`. The worker's gate remains the enforcement;
 * this only decides the client-side affordance.
 */
export function classifyLanguageCreate(
  slug: string,
  existing: ExistingLanguage | null,
  editRights: LanguageRights | undefined,
  publishRights: LanguageRights | undefined
): LanguageCreateAction {
  if (existing === null) return { kind: "create" };
  if (!hasRights(editRights, slug)) return { kind: "blocked", reason: "edit" };
  if (existing.published && !hasRights(publishRights, slug)) {
    return { kind: "blocked", reason: "publish" };
  }
  return { kind: "confirm" };
}
