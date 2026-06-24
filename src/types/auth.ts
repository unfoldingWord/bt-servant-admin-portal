// Language-shepherd permissions. `"*"` means full access (typically org admins);
// a string array enumerates the language names the user is allowed to read/edit.
// `undefined` means the engine has not yet populated this field — treated as
// full access for back-compat until bt-servant-engine#207 ships.
export type LanguageRights = string[] | "*";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  // Cross-org "super admin". When true, the UI lifts org filters on the
  // /admin/users page, makes the Org field editable in create/edit
  // dialogs, and surfaces an isSuperAdmin checkbox. The backend enforces
  // the same powers regardless of UI state (worker/admin.ts +
  // worker/config.ts both honor the "super trumps isAdmin" rule).
  isSuperAdmin?: boolean;
  // Legacy single-bit rights, kept as the lazy-migration source for the
  // four verb-perms fields below. Pre-#181 sessions only carry this one;
  // the BFF (`worker/auth.ts`) lazy-maps it into the verb-perms fields on
  // every request so the client always sees both shapes. See #181.
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}
