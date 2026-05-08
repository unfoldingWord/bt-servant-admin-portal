import type { LanguageRights } from "@/types/auth";

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
