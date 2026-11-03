// Machine-readable `code`s on the error bodies the BFF itself generates,
// next to the human `error` text (an extra field; readers of `error` are
// unaffected). Engine bodies the BFF passes through are never rewritten.

/** The generic codes the BFF attaches on every /api/config route. */
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
