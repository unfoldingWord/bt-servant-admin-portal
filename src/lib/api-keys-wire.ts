// Shared between the BFF (worker/api-keys.ts) and the client for the API keys
// page (#354). No browser or worker dependencies, so both sides can import it.

/**
 * The partner terms of use, accepted once per org before its first key. The
 * text is Elsy's one line from #354 (2026-11-10). Any change to the text must
 * come with a new `API_TERMS_VERSION`: acceptance is recorded per version, so
 * a new version has to be accepted again before the next key.
 */
export const API_TERMS_VERSION = "2026-11-10";
export const API_TERMS_TEXT =
  "The API is for end-user apps, not bulk data extraction or automated scraping.";

/** Machine-readable `code`s on the API keys routes' own error bodies. */
export const API_KEY_ERRORS = {
  /** 409: the org hasn't accepted the current terms; resend with `acceptTerms`. */
  termsNotAccepted: "terms_not_accepted",
  /** 400: the org's id can't hold API keys (the worker's org id shape). */
  orgNotKeyable: "org_not_keyable",
  /** 403: the key belongs to another org and the caller isn't a super admin. */
  keyOtherOrg: "api_key_other_org",
  /** 403: listing every org's keys requires a super admin. */
  allOrgsForbidden: "all_orgs_forbidden",
} as const;

/**
 * The org ids the worker will bind a key to (`ORG_PATTERN` in the worker's
 * src/types/partner-keys.ts). Checked by the BFF first so an org that can't
 * hold keys gets a clear answer instead of the worker's field-level 400.
 */
export const KEYABLE_ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** A key id as the worker issues it (`PARTNER_KEY_ID_PATTERN`). */
export const API_KEY_ID_PATTERN = /^pk_[0-9a-f]{16}$/;

/** Rotation grace choices offered in the UI, in seconds (worker max: 30 days). */
export const ROTATION_GRACE_OPTIONS = [
  { seconds: 7 * 24 * 60 * 60, label: "Keep the old key working for 7 days" },
  { seconds: 24 * 60 * 60, label: "Keep the old key working for 24 hours" },
  { seconds: 0, label: "Stop the old key now" },
] as const;
