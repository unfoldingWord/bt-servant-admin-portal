// Shared request bits for the client's BFF calls.

/**
 * The BFF's same-origin guard (`requireSameOrigin` in worker/helpers.ts)
 * rejects any request without this header. Browsers block custom headers
 * on cross-origin requests unless CORS allows them, so its presence shows
 * the call came from the portal itself.
 */
export const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;
