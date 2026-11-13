// Partner API keys (#354). Shapes of the worker's public key projection
// (`toPublicPartnerKey`, bt-servant-worker src/types/partner-keys.ts) as the
// BFF passes them through, plus the BFF's own envelope.

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKey {
  /** Stable public id (`pk_<16 hex>`). */
  id: string;
  /** Non-secret leading part of the key (`bts_<8 hex>`), to tell keys apart. */
  prefix: string;
  name: string;
  app: string;
  org: string;
  createdBy: string;
  createdAt: string;
  status: ApiKeyStatus;
  revokedAt?: string;
  revokedBy?: string;
  rotatedFrom?: string;
  rotatedTo?: string;
  /** End of a rotation grace window, on the replaced key. */
  expiresAt?: string;
  termsVersion?: string;
  termsAcceptedAt?: string;
  /**
   * When the key last authenticated a request. Optional: older workers don't
   * record it, and a key that was never used has none.
   */
  lastUsedAt?: string;
}

/** One org's acceptance of one terms version (stored by the BFF in AUTH_KV). */
export interface ApiTermsAcceptance {
  org: string;
  version: string;
  acceptedBy: string;
  acceptedAt: string;
}

export interface ApiKeyListResponse {
  /** The org listed, or null when a super admin listed every org. */
  org: string | null;
  keys: ApiKey[];
  /** Terms status for the target org (the context org, even in the all-orgs view). */
  terms: {
    org: string;
    currentVersion: string;
    text: string;
    acceptance: ApiTermsAcceptance | null;
  };
}

export interface ApiKeyCreateInput {
  name: string;
  app: string;
  /** Set to the current terms version to accept the terms with this create. */
  acceptTerms?: string;
}

/** Create and rotate both return the new key's plaintext, exactly once. */
export interface ApiKeyIssued {
  key: ApiKey;
  apiKey: string;
  warnings?: string[];
}
