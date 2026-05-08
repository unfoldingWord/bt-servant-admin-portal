import type { LanguageRights } from "@/types/auth";

// Mirrors the worker `safeUser` response shape from /api/admin/users.
// Password fields are deliberately not in the API response.
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  org: string;
  isAdmin: boolean;
  language_rights?: LanguageRights;
}

export interface CreateUserBody {
  email: string;
  password: string;
  name: string;
  org: string;
  isAdmin?: boolean;
  language_rights?: LanguageRights;
}

export interface UpdateUserBody {
  name?: string;
  org?: string;
  password?: string;
  isAdmin?: boolean;
  language_rights?: LanguageRights;
}
