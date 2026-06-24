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
  // Cross-org "super admin" role. When true, the user can manage users in
  // any org (the org-scope filters in worker/admin.ts are skipped) and can
  // grant/revoke isSuperAdmin on others. Implies isAdmin for the purpose of
  // passing admin auth even if isAdmin happens to be false. Bootstrap is
  // via the X-Admin-Secret CLI (PUT /api/admin/users/<email>); revocation
  // is via the same path or via another super-admin from the UI.
  isSuperAdmin?: boolean;
  // Legacy single-bit rights, kept as the lazy-migration source for the
  // four verb-perms fields below. Pre-#181 records only set this one; new
  // writes since #181 set the verb-perms fields directly. validateSession
  // falls back to `language_rights` when a verb-perms field is absent so
  // existing users keep their access without a one-shot migration script.
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  // Mode rights have no legacy fallback — pre-#181 there was no per-mode
  // permission concept at all (all admins could edit/publish any mode).
  // Treated as full access when absent for back-compat with that prior
  // behavior; enforcement lands in PR 2.
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  // Re-hydrated from StoredUser on every request in validateSession, so
  // grants/revocations take effect on the next request rather than at
  // 7-day session expiry. Same lifecycle as isAdmin.
  isSuperAdmin?: boolean;
  createdAt: string;
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}
