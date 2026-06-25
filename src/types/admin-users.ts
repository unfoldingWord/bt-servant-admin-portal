import type { LanguageRights } from "@/types/auth";

// Mirrors the worker `safeUser` response shape from /api/admin/users.
// Password fields are deliberately not in the API response.
//
// `language_rights` is the pre-#181 single-bit field. Verb-perms (the four
// `*_edit_rights` / `*_publish_rights` fields) layer on top: when absent on
// a row, the worker lazy-migrates from `language_rights`. The dialog always
// persists the verb-perms fields explicitly so newly-granted rights don't
// leak full access via the `undefined === legacy` fallback.
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  // Only set/relevant when the viewer is a super-admin (org admins receive
  // an org-filtered list where this field is still present but typically
  // false). The UI gates the Super badge + Super checkbox on the viewer's
  // role, not the row's.
  isSuperAdmin?: boolean;
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}

export interface CreateUserBody {
  email: string;
  password: string;
  name: string;
  org: string;
  isAdmin?: boolean;
  // Only honored by the worker when the caller scope is super or
  // super-by-session. Org admins sending this get a loud 403.
  isSuperAdmin?: boolean;
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}

export interface UpdateUserBody {
  name?: string;
  org?: string;
  password?: string;
  isAdmin?: boolean;
  // Same gate as CreateUserBody — worker rejects with 403 from non-super
  // scopes. Distinct from isAdmin (org admins may grant/revoke isAdmin
  // within their own org).
  isSuperAdmin?: boolean;
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}
