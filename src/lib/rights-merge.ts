import type { LanguageRights } from "@/types/auth";

// Merges a newly bootstrapped slug into a LanguageRights value, used
// by both admin-user dialogs to close review F4: after Create draft,
// the panel hands the slug back and the parent auto-adds it to the
// user's language_edit_rights + language_publish_rights so the very
// deadlock #247 targets isn't reproduced by an admin who forgets to
// tick the new chip.
//
// - undefined → left as undefined. Legacy back-compat means the user
//   has full access; narrowing to `[slug]` would silently REMOVE
//   access to everything else.
// - "*"       → left as "*". Full access already covers the new slug.
// - array     → slug appended if not present, then sorted so equality
//               with the initial value normalizes correctly (edit
//               dialog's diffRights compares sorted JSON strings).
export function addSlugToRights(
  rights: LanguageRights | undefined,
  slug: string
): LanguageRights | undefined {
  if (rights === undefined) return undefined;
  if (rights === "*") return "*";
  if (rights.includes(slug)) return rights;
  return [...rights, slug].sort();
}
