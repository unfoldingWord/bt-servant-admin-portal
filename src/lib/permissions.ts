import type { LanguageRights } from "@/types/auth";

// Mirror of worker/config.ts hasAdminPowers — true for org admins OR
// super admins. The "super trumps isAdmin" rule lives in worker/admin.ts:
// a super-admin who self-demotes isAdmin (allowed; they retain cross-org
// powers via super) must still pass UI gates. Without this, the client
// would redirect them away from /admin/users and the sidebar Modes/Users
// entries would disappear even though the worker would let them through.
export function hasAdminPowers(
  user: { isAdmin?: boolean; isSuperAdmin?: boolean } | null | undefined
): boolean {
  if (!user) return false;
  return (user.isAdmin ?? false) || (user.isSuperAdmin ?? false);
}

// `undefined` is the back-compat default for users predating the rights
// system — treat it as full access so they aren't locked out. The worker
// applies the same rule, including the lazy migration from legacy
// `language_rights` to the four verb-perms fields (`worker/auth.ts`).
export function hasRights(
  rights: LanguageRights | undefined,
  name: string
): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.includes(name);
}

export function hasAnyRights(rights: LanguageRights | undefined): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.length > 0;
}

// Pre-verb-perms helper — equivalent to `hasRights` on the legacy
// `language_rights` field. New call sites should prefer the verb-specific
// helpers below so edit and publish gates stay separable.
export function hasLanguageRights(
  rights: LanguageRights | undefined,
  name: string
): boolean {
  return hasRights(rights, name);
}

export function hasAnyLanguageRights(
  rights: LanguageRights | undefined
): boolean {
  return hasAnyRights(rights);
}

// Union helpers — "user has *some* access via *either* verb on *some*
// item." Used by page-level / sidebar gates that just decide whether to
// render the surface at all; finer-grained gates (per-item edit vs
// publish) use the verb-specific helpers directly.
export function hasAnyLanguageAccess(
  user:
    | {
        language_edit_rights?: LanguageRights;
        language_publish_rights?: LanguageRights;
      }
    | null
    | undefined
): boolean {
  if (!user) return false;
  return (
    hasAnyRights(user.language_edit_rights) ||
    hasAnyRights(user.language_publish_rights)
  );
}

export function hasAnyModeAccess(
  user:
    | {
        mode_edit_rights?: LanguageRights;
        mode_publish_rights?: LanguageRights;
      }
    | null
    | undefined
): boolean {
  if (!user) return false;
  return (
    hasAnyRights(user.mode_edit_rights) ||
    hasAnyRights(user.mode_publish_rights)
  );
}

// Filter to items the user can access via *some* verb. Mirrors the
// per-language list filter applied before rendering the dropdown — we
// don't want to show entries the user can neither edit nor publish.
export function filterByAnyRights<T extends { name: string }>(
  items: T[],
  edit: LanguageRights | undefined,
  publish: LanguageRights | undefined
): T[] {
  // `undefined` for either side means legacy full access; combined that's
  // also full access.
  if (
    edit === undefined ||
    edit === "*" ||
    publish === undefined ||
    publish === "*"
  ) {
    return items;
  }
  const allowed = new Set<string>([...edit, ...publish]);
  return items.filter((i) => allowed.has(i.name));
}

export function filterAuthorizedLanguages<T extends { name: string }>(
  languages: T[],
  rights: LanguageRights | undefined
): T[] {
  if (rights === undefined || rights === "*") return languages;
  const allowed = new Set(rights);
  return languages.filter((l) => allowed.has(l.name));
}
