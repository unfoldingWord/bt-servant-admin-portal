// ---------------------------------------------------------------------------
// Shared worker types
// ---------------------------------------------------------------------------

// Language-shepherd permissions. `"*"` means full access (typically org admins);
// a string array enumerates the language names the user is allowed to read/edit.
// `undefined` means rights have not been assigned — treated as full access for
// back-compat so existing pre-permission users aren't locked out.
export type LanguageRights = string[] | "*";

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  org: string;
  passwordHash: string;
  salt: string;
  isAdmin: boolean;
  language_rights?: LanguageRights;
}

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  createdAt: string;
  language_rights?: LanguageRights;
}
