// Machine-readable `code`s on the error bodies the BFF itself generates,
// next to the human `error` text (an extra field; readers of `error` are
// unaffected). Engine bodies the BFF passes through are never rewritten.

/** The 401 / 403 the BFF generates on /api/config (session, same-origin, org checks). */
export const BFF_AUTH_ERRORS = {
  /** 401: no valid session. */
  unauthorized: "unauthorized",
  /** 403: not same-origin, or another org's config without super-admin. */
  forbidden: "forbidden",
} as const;
