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
  language_rights?: LanguageRights;
}
