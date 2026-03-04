// ---------------------------------------------------------------------------
// Shared worker types
// ---------------------------------------------------------------------------

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  isAdmin: boolean;
}

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}
