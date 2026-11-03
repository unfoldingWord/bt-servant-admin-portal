// Client for the BFF's per-mode share-code route (#345,
// `GET /api/config/modes/{name}/share-code`, worker/share-config.ts).
//
// The worker (bt-servant-worker#477) is the source of truth for which
// `#<code>` opens a mode on WhatsApp: it runs the chat path's own read,
// merge and classifier from the gateway org's point of view. The portal
// only renders its answer.

import { buildConfigUrl } from "@/lib/config-url";
import {
  parseShareCodeAnswer,
  SHARE_CODE_ERRORS,
  type ModeShareCodeResponse,
} from "@/types/mode-share-code";
import { SAME_ORIGIN_HEADERS } from "@/lib/http";

/** Root of every share-code query, for invalidation after mode writes. */
export const MODE_SHARE_CODE_KEY = ["mode-share-code"] as const;

/**
 * A definite reason the share-code request can't give an answer. These
 * are answers too (data): retrying won't change them.
 */
export type ShareCodeFailure =
  /** 401: the session has ended. */
  | "signed-out"
  /** 403: the caller can't read this org's modes. */
  | "forbidden"
  /** 400 code `invalid_mode_name`: the worker's pattern, or a path the BFF couldn't decode. */
  | "invalid-name"
  /** 400 code `invalid_org`: the mode's org (BFF org resolution, or the worker's `field: "org"`). */
  | "org-invalid"
  /** Any other 400. */
  | "bad-request"
  /** 500 code `corrupt_modes_record`: permanent until the record is repaired. */
  | "corrupt-record";

/** A transient outcome worth retrying. */
export type ShareCodeTransient =
  /** 503: the worker couldn't list or read modes just now. */
  | "unavailable"
  /** Other 5xx, or a body this client can't read. */
  | "server"
  /** The request never got an answer. */
  | "network";

/**
 * Thrown for a transient outcome, so TanStack Query treats it as a failed
 * fetch: on a refetch it keeps the last answer (`isRefetchError`), and the
 * panel offers Try again.
 */
export class ShareCodeRequestError extends Error {
  readonly kind: ShareCodeTransient;
  constructor(kind: ShareCodeTransient) {
    super(`Share code request failed: ${kind}`);
    this.name = "ShareCodeRequestError";
    this.kind = kind;
  }
}

/**
 * Every definite answer a share-code request can come back with: one of
 * the route's 200 bodies (the shared wire type), or a state this client
 * derives from a definite error status. Transient outcomes are thrown
 * (`ShareCodeRequestError`), not returned.
 */
export type ModeShareCode =
  | ModeShareCodeResponse
  /** 404 `mode_not_found`: no such mode in this org. */
  | { capability: "not-found" }
  /**
   * 404 `share_code_unsupported`, or a non-JSON / empty 404: the worker
   * (or this BFF) has no share-code route. No
   * code is offered for any mode until BT Servant is upgraded.
   */
  | { capability: "upgrade-needed" }
  | { capability: "failed"; failure: ShareCodeFailure };

export async function getModeShareCode(
  modeName: string,
  org: string | null | undefined,
  signal?: AbortSignal
): Promise<ModeShareCode> {
  let res: Response;
  try {
    res = await fetch(
      buildConfigUrl(
        `/api/config/modes/${encodeURIComponent(modeName)}/share-code`,
        org
      ),
      { headers: SAME_ORIGIN_HEADERS, signal }
    );
  } catch (error) {
    // A cancelled query must stay a cancellation, not a "network" state.
    if (signal?.aborted) throw error;
    throw new ShareCodeRequestError("network");
  }
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  // The BFF's machine-readable code; the human `error` text is never read.
  const code = typeof data?.code === "string" ? data.code : null;
  if (res.status === 503) throw new ShareCodeRequestError("unavailable");
  if (res.status === 404) return notFoundAnswer(data, code);
  if (!res.ok) {
    const failure = definiteFailure(res.status, code);
    if (failure === null) throw new ShareCodeRequestError("server");
    return { capability: "failed", failure };
  }
  const parsed = parseShareCodeResponse(data);
  if (parsed === null) throw new ShareCodeRequestError("server");
  return parsed;
}

/**
 * A 404: the mode is gone, or the share-code route doesn't exist (the
 * BFF's `share_code_unsupported`, or a non-JSON / empty 404 from a portal
 * without the route). Any other JSON 404 means the route exists and
 * something else failed: transient.
 */
function notFoundAnswer(
  data: Record<string, unknown> | null,
  code: string | null
): ModeShareCode {
  if (code === SHARE_CODE_ERRORS.modeNotFound)
    return { capability: "not-found" };
  if (code === SHARE_CODE_ERRORS.shareCodeUnsupported) {
    return { capability: "upgrade-needed" };
  }
  if (data === null || typeof data !== "object") {
    return { capability: "upgrade-needed" };
  }
  throw new ShareCodeRequestError("server");
}

/** Name a definite failure by status and code, or null when it's transient. */
function definiteFailure(
  status: number,
  code: string | null
): ShareCodeFailure | null {
  if (status === 401) return "signed-out";
  if (status === 403) return "forbidden";
  if (status === 400) {
    if (code === SHARE_CODE_ERRORS.invalidModeName) return "invalid-name";
    if (code === SHARE_CODE_ERRORS.invalidOrg) return "org-invalid";
    return "bad-request";
  }
  if (status === 500 && code === SHARE_CODE_ERRORS.corruptModesRecord) {
    return "corrupt-record";
  }
  return null;
}

/** Read a 200 body into the wire type, or null when it isn't one. */
export function parseShareCodeResponse(
  data: Record<string, unknown> | null
): ModeShareCodeResponse | null {
  if (data === null) return null;
  switch (data.capability) {
    case "unconfigured":
      return { capability: "unconfigured" };
    case "present": {
      const answer = parseShareCodeAnswer(data);
      if (answer === null || typeof data.home_org !== "string") return null;
      return { capability: "present", home_org: data.home_org, ...answer };
    }
    default:
      return null;
  }
}
