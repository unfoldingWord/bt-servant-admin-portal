// ---------------------------------------------------------------------------
// Shared worker types
// ---------------------------------------------------------------------------

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  org: string;
  passwordHash: string;
  salt: string;
  isAdmin: boolean;
}

// Language-shepherd permissions. `"*"` means full access (typically org admins);
// a string array enumerates the language names the user is allowed to read/edit.
// `undefined` means the engine has not yet populated this field — treated as
// full access for back-compat until bt-servant-engine#207 ships.
export type LanguageRights = string[] | "*";

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  createdAt: string;
  language_rights?: LanguageRights;
}
