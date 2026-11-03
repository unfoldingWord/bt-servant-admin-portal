// #345 — the runtime half of the share-code wire contract, shared by the
// BFF (worker/share-config.ts) and the client (mode-share-code-api.ts):
// the error codes and the answer parser. The types are
// src/types/mode-share-code.ts.

import { BFF_ERRORS } from "@/lib/bff-errors";
import type { ShareCodeAnswer } from "@/types/mode-share-code";

/**
 * Machine-readable `code` on every error body of the share-code route
 * (`{error, code}`); the client switches on `code` only, never on the
 * human `error` text. The first four are also the WORKER's own `error`
 * strings (#477), which is how the BFF reads them.
 */
export const SHARE_CODE_ERRORS = {
  /** 404: no such mode in this org. */
  modeNotFound: "mode_not_found",
  /** 500, permanent: the org's stored modes record is unreadable. */
  corruptModesRecord: "corrupt_modes_record",
  /** 400: the mode name fails the worker's pattern, or the BFF couldn't decode it. */
  invalidModeName: "invalid_mode_name",
  /** 400: any other bad request. */
  badRequest: "bad_request",
  /**
   * 400 `invalid_org` (the mode's org: the BFF's own org resolution, or the
   * worker's `invalid_org` with `field: "org"`; the worker's `field:
   * "home_org"` answers become `unconfigured`), 401 and 403: the BFF's
   * generic codes (see `src/lib/bff-errors.ts` for which other responses
   * carry them).
   */
  ...BFF_ERRORS,
  /** 405: the route is GET only. */
  methodNotAllowed: "method_not_allowed",
  /**
   * 404: the worker has no share-code route (a non-JSON or empty 404). The
   * panel says a newer BT Servant is needed.
   */
  shareCodeUnsupported: "share_code_unsupported",
  /** 503: the worker couldn't list or read modes just now. */
  modesUnavailable: "modes_unavailable",
  /** 504: the worker didn't answer (or finish answering) in time. */
  engineTimeout: "engine_timeout",
  /**
   * 502: the worker refused the BFF's own credentials (401 / 403). A
   * configuration problem, not the caller's session.
   */
  engineAuth: "engine_auth",
  /** 502: anything else from the worker the BFF can't use. */
  engineError: "engine_error",
} as const;

export type ShareCodeErrorCode =
  (typeof SHARE_CODE_ERRORS)[keyof typeof SHARE_CODE_ERRORS];

/**
 * Shape-check the answer fields, or null when they aren't an answer. Used
 * by the BFF on the worker's 200 and by the client on the BFF's, so a
 * malformed answer never reaches a QR. Unknown `reason` strings pass (the
 * contract is additive); a non-boolean `home_has_modes` is dropped rather
 * than failing the answer, since it only drives a note.
 */
export function parseShareCodeAnswer(body: unknown): ShareCodeAnswer | null {
  if (body === null || typeof body !== "object") return null;
  const {
    code,
    resolves,
    reason,
    resolved_org,
    resolved_org_uncertain,
    home_has_modes,
  } = body as Record<string, unknown>;
  // An empty code can't be a trigger: malformed, like a non-string.
  if (code !== null && (typeof code !== "string" || code === "")) {
    return null;
  }
  if (typeof resolves !== "boolean") return null;
  // A code that resolves has to be there to build a link from.
  if (resolves && code === null) return null;
  if (reason !== undefined && typeof reason !== "string") return null;
  if (resolved_org !== undefined && typeof resolved_org !== "string") {
    return null;
  }
  return {
    code,
    resolves,
    ...(reason !== undefined ? { reason } : {}),
    ...(resolved_org !== undefined ? { resolved_org } : {}),
    // Only `true` means anything; anything else is dropped like an absent
    // field, since it only adds a "may change" line.
    ...(resolved_org_uncertain === true
      ? { resolved_org_uncertain: true }
      : {}),
    ...(typeof home_has_modes === "boolean" ? { home_has_modes } : {}),
  };
}
