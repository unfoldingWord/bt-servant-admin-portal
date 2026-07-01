import type { LanguageRights } from "@/types/auth";

// Shape of the language-rights fields carried on a user/session, shared
// by the effective-rights helpers below and the language-bootstrap gate
// so the structural type has a single definition.
export interface LanguageRightsCarrier {
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  language_rights?: LanguageRights;
}

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

// Effective verb-perm helpers — client-side mirror of
// worker/auth.ts:lazyMigrateLanguageRights. Return the rights value
// the WORKER will see for this user at request time, applying the
// partner-aware rule:
//
//   - If the explicit verb-perm is set, use it.
//   - Else if the PARTNER verb-perm is set, the unset verb is a
//     deliberate gap (= []), NOT legacy back-compat. Without this
//     rule, a stored user with `language_rights: "*"` plus an
//     explicit `language_edit_rights: ["spanish"]` would show as
//     publish="*" in the admin UI even though the worker treats them
//     as publish=[] — admin saves through the dialog would then
//     persist the misleading "*" explicitly, silently widening
//     access (Frank rd-2 P1).
//   - Else (both verb-perms unset) fall back to legacy
//     `language_rights` for languages, or undefined for modes (which
//     have no legacy fallback).
export function effectiveLanguageEditRights(
  user:
    | {
        language_edit_rights?: LanguageRights;
        language_publish_rights?: LanguageRights;
        language_rights?: LanguageRights;
      }
    | null
    | undefined
): LanguageRights | undefined {
  if (!user) return undefined;
  if (user.language_edit_rights !== undefined) return user.language_edit_rights;
  if (user.language_publish_rights !== undefined) return [];
  return user.language_rights;
}

export function effectiveLanguagePublishRights(
  user:
    | {
        language_edit_rights?: LanguageRights;
        language_publish_rights?: LanguageRights;
        language_rights?: LanguageRights;
      }
    | null
    | undefined
): LanguageRights | undefined {
  if (!user) return undefined;
  if (user.language_publish_rights !== undefined)
    return user.language_publish_rights;
  if (user.language_edit_rights !== undefined) return [];
  return user.language_rights;
}

export function effectiveModeEditRights(
  user:
    | {
        mode_edit_rights?: LanguageRights;
        mode_publish_rights?: LanguageRights;
      }
    | null
    | undefined
): LanguageRights | undefined {
  if (!user) return undefined;
  if (user.mode_edit_rights !== undefined) return user.mode_edit_rights;
  if (user.mode_publish_rights !== undefined) return [];
  return undefined;
}

export function effectiveModePublishRights(
  user:
    | {
        mode_edit_rights?: LanguageRights;
        mode_publish_rights?: LanguageRights;
      }
    | null
    | undefined
): LanguageRights | undefined {
  if (!user) return undefined;
  if (user.mode_publish_rights !== undefined) return user.mode_publish_rights;
  if (user.mode_edit_rights !== undefined) return [];
  return undefined;
}

// Union helpers — "user has *some* access via *either* verb on *some*
// item." Used by page-level / sidebar gates that just decide whether to
// render the surface at all; finer-grained gates (per-item edit vs
// publish) use the verb-specific helpers directly.
//
// Languages preserve the pre-#181 "undefined → legacy full access" rule
// — both verbs unset and no legacy `language_rights` means the user
// predates the rights system and gets default full access. Same as the
// worker's rightsFor language path.
export function hasAnyLanguageAccess(
  user:
    | {
        language_edit_rights?: LanguageRights;
        language_publish_rights?: LanguageRights;
        language_rights?: LanguageRights;
      }
    | null
    | undefined
): boolean {
  if (!user) return false;
  return (
    hasAnyRights(user.language_edit_rights ?? user.language_rights) ||
    hasAnyRights(user.language_publish_rights ?? user.language_rights)
  );
}

// Modes have NO legacy fallback — pre-#181 the mode gate was admin-
// only. `mode_edit_rights = undefined && mode_publish_rights = undefined`
// for a non-admin means "no access" (worker's mode-baseline gate
// returns 403). The sidebar/page entry-point must NOT enable for
// undefined-undefined non-admin users; admins are gated separately via
// hasAdminPowers. Calling code typically combines:
//   `hasAdminPowers(user) || hasAnyModeAccess(user)`
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
  if (
    user.mode_edit_rights === undefined &&
    user.mode_publish_rights === undefined
  ) {
    return false;
  }
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
