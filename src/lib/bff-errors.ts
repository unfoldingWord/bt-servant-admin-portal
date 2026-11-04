// Machine-readable `code`s on some of the error bodies the BFF itself
// generates, next to the human `error` text (an extra field; readers of
// `error` are unaffected). Only these responses carry one:
//   - every error of the share-code route
//     (`/api/config/modes/{name}/share-code`, its own codes in
//     `SHARE_CODE_ERRORS`, which include these);
//   - the org-resolution errors on /api/config routes (`orgErrorResponse`:
//     `invalid_org`, `cross_org_forbidden`);
//   - the same-origin 403 (`requireSameOrigin`) and the session 401 on
//     /api/config and /api/share-config (`authErrorResponse`).
// Other BFF errors (e.g. a generic config route's 400 / 404 / 405) have
// no code, and engine bodies the BFF passes through are never rewritten.

/** The generic codes on the responses listed above. */
export const BFF_ERRORS = {
  /** 400: the org (the `?org=` param or the resolved org) is invalid. */
  invalidOrg: "invalid_org",
  /** 401: no valid session. */
  unauthorized: "unauthorized",
  /** 403: not same-origin (or another 403 a retry may clear). */
  forbidden: "forbidden",
  /**
   * 403: another org's config without super-admin. Deterministic: the
   * same session gets the same answer until its rights change.
   */
  crossOrgForbidden: "cross_org_forbidden",
} as const;
