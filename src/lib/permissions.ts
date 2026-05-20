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

// `undefined` is the back-compat default until bt-servant-engine#207 lands —
// treat it as full access so existing users aren't locked out.
export function hasLanguageRights(
  rights: LanguageRights | undefined,
  name: string
): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.includes(name);
}

export function hasAnyLanguageRights(
  rights: LanguageRights | undefined
): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.length > 0;
}

export function filterAuthorizedLanguages<T extends { name: string }>(
  languages: T[],
  rights: LanguageRights | undefined
): T[] {
  if (rights === undefined || rights === "*") return languages;
  const allowed = new Set(rights);
  return languages.filter((l) => allowed.has(l.name));
}
