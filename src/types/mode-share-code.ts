// #345 — wire contract of the BFF's `GET /api/config/modes/{name}/share-code`
// (worker/share-config.ts), shared by the BFF (which builds it) and the
// client (src/lib/mode-share-code-api.ts, which reads it). One type and one
// field parser, so the two sides can't drift.
//
// The worker behind it is bt-servant-worker#477: it runs the chat path's
// own read, merge and classifier and says which `#<code>` opens a mode
// from the gateway org's point of view.

import { BFF_AUTH_ERRORS } from "@/types/bff-errors";

/**
 * Why the worker's code does not (or cannot) open the mode. The known
 * values are listed; the worker contract is additive, so any other string
 * is possible and reads as "does not open this mode".
 */
export type KnownShareCodeReason =
  | "not_found"
  | "draft"
  | "requires_group"
  | "reserved"
  | "collision"
  | "capped"
  | "org_skipped"
  | "ambiguous"
  /** The stored mode fails the admin PUT shape check, so chat never sees it. */
  | "invalid_mode";
// The intersection keeps the known values in editor completion while
// admitting future ones (a bare `| string` would swallow them).
export type ShareCodeReason =
  | KnownShareCodeReason
  | (string & Record<never, never>);

/** The worker's answer fields, as both the worker and the BFF send them. */
export interface ShareCodeAnswer {
  /** The token without `#`; null when no code can be formed. */
  code: string | null;
  resolves: boolean;
  reason?: ShareCodeReason;
  /** Raw org of the mode `#<code>` actually opens. */
  resolved_org?: string;
  /**
   * True on a `resolves: false` answer when another org couldn't be read
   * just now (bt-servant-worker#477): `resolved_org` is then omitted, and
   * the reason still stands but may change on a re-check.
   */
  resolved_org_uncertain?: boolean;
  /**
   * False when the gateway org has no modes record (the chat path then
   * treats home as empty). Absent when the worker couldn't read the home
   * record for a foreign mode: unknown, so no note. Drives a non-blocking
   * note only.
   */
  home_has_modes?: boolean;
}

/** The 200 bodies of the share-code route. */
export type ModeShareCodeResponse =
  /**
   * The worker answered. The BFF adds `home_org` (WHATSAPP_ORG, as sent)
   * and `queried_org`: the exact org string it asked the worker about.
   * `resolved_org` is compared to `queried_org` byte for byte (the
   * worker's own org keys are exact, #247/#253), never trimmed.
   */
  | ({
      capability: "present";
      home_org: string;
      queried_org: string;
    } & ShareCodeAnswer)
  /**
   * WHATSAPP_ORG is unusable for this environment: unset or caught by the
   * BFF's guard (the worker isn't asked), or rejected by the worker as
   * `invalid_org` with `field: "home_org"`.
   */
  | { capability: "unconfigured" };

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
  /**
   * 400: the mode's org is invalid (the BFF's own org resolution, or the
   * worker's `invalid_org` with `field: "org"`). The worker's `field:
   * "home_org"` answers are WHATSAPP_ORG's, so the BFF turns them into
   * `unconfigured` instead.
   */
  invalidOrg: "invalid_org",
  /** 400: any other bad request. */
  badRequest: "bad_request",
  /** 401 / 403: the BFF's generic auth codes, shared with every /api/config route. */
  ...BFF_AUTH_ERRORS,
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
