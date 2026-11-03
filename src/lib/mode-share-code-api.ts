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
} from "@/lib/mode-share-code-wire";
import type { ModeShareCodeResponse } from "@/types/mode-share-code";
import { SAME_ORIGIN_HEADERS } from "@/lib/http";

/** Root of every share-code query. */
export const MODE_SHARE_CODE_KEY = ["mode-share-code"] as const;

/**
 * Share-code query keys. `org` is the page's org param (null = the
 * caller's own org), the same value its mode queries and writes use, so a
 * save can read its mode's last answer. A write that may change a code
 * invalidates every org's codes at once (`MODE_SHARE_CODE_KEY`, via
 * `invalidateShareCodes`).
 */
export const modeShareCodeKeys = {
  mode: (org: string | null, modeName: string) =>
    [...MODE_SHARE_CODE_KEY, org, modeName] as const,
};

/**
 * Whether a saved mode's share code may have changed, so its org's share
 * codes are re-asked. Only what the worker's answer depends on counts: a
 * new mode, a publish or group-only flip, or a save over a mode the worker
 * last called damaged (`invalid_mode`; a successful PUT stores a
 * well-shaped mode). A document autosave changes none of them.
 */
export function saveMayChangeShareCode(
  before: { published?: boolean; requires_group?: boolean } | undefined,
  after: { published?: boolean; requires_group?: boolean },
  lastAnswer: ModeShareCode | undefined
): boolean {
  if (before === undefined) return true;
  if ((before.published === true) !== (after.published === true)) return true;
  if ((before.requires_group === true) !== (after.requires_group === true)) {
    return true;
  }
  return (
    lastAnswer?.capability === "present" &&
    !lastAnswer.resolves &&
    lastAnswer.reason === "invalid_mode"
  );
}

/**
 * A definite reason the share-code request can't give an answer. These
 * are answers too (data): retrying won't change them.
 */
export type ShareCodeFailure =
  /** 400 code `invalid_mode_name`: the worker's pattern, or a path the BFF couldn't decode. */
  | "invalid-name"
  /** 400 code `invalid_org`: the mode's org (BFF org resolution, or the worker's `field: "org"`). */
  | "org-invalid"
  /** Any other 400. */
  | "bad-request"
  /** 500 code `corrupt_modes_record`: permanent until the record is repaired. */
  | "corrupt-record"
  /**
   * 502 code `engine_auth`: BT Servant refused the portal's own credentials.
   * A configuration problem; never retried on its own.
   */
  | "engine-auth"
  /**
   * 403 code `cross_org_forbidden`: another org's modes without
   * super-admin. Deterministic for this session, so not retried on its own.
   */
  | "cross-org-forbidden";

/** A transient outcome worth retrying. */
export type ShareCodeTransient =
  /** 503: the worker couldn't list or read modes just now. */
  | "unavailable"
  /** Other 5xx, or a body this client can't read. */
  | "server"
  /** The request never got an answer, or its body was cut off. */
  | "network"
  /**
   * 401: the session looks ended. Retryable, not cached as an answer: a
   * session blip mustn't stick for the stale time.
   */
  | "signed-out"
  /**
   * 403 without a deterministic code (e.g. the same-origin guard).
   * Retryable for the same reason.
   */
  | "forbidden";

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
   * 404 `share_code_unsupported`: the BFF reports a worker without the
   * share-code route. No code is offered for any mode until BT Servant is
   * upgraded.
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
  // Decided by status alone, before the body is read: a body cut off on a
  // 401 still says "signed out".
  if (res.status === 503) throw new ShareCodeRequestError("unavailable");
  if (res.status === 401) throw new ShareCodeRequestError("signed-out");
  if (res.status === 403) return forbiddenAnswer(res, signal);
  const data = await readJsonBody(res, signal);
  // The BFF's machine-readable code; the human `error` text is never read.
  const code = typeof data?.code === "string" ? data.code : null;
  if (res.status === 404) return notFoundAnswer(code);
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
 * The body as a JSON object, or null when a fully received body isn't
 * one. A read that fails (the request aborted, or the connection cut) is
 * not a body to classify: a cancellation stays one, anything else is
 * "network".
 */
async function readJsonBody(
  res: Response,
  signal: AbortSignal | undefined
): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ShareCodeRequestError("network");
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * A 403: definite when the BFF codes it deterministic (another org
 * without super-admin), else a retryable "forbidden", also when its body
 * can't be read.
 */
async function forbiddenAnswer(
  res: Response,
  signal: AbortSignal | undefined
): Promise<ModeShareCode> {
  let data: Record<string, unknown> | null = null;
  try {
    data = await readJsonBody(res, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  if (data?.code === SHARE_CODE_ERRORS.crossOrgForbidden) {
    return { capability: "failed", failure: "cross-org-forbidden" };
  }
  throw new ShareCodeRequestError("forbidden");
}

/**
 * A 404: the mode is gone, or the BFF reports a worker without the
 * share-code route (`share_code_unsupported`). Anything else means the
 * route exists and something else failed: transient.
 */
function notFoundAnswer(code: string | null): ModeShareCode {
  if (code === SHARE_CODE_ERRORS.modeNotFound) {
    return { capability: "not-found" };
  }
  if (code === SHARE_CODE_ERRORS.shareCodeUnsupported) {
    return { capability: "upgrade-needed" };
  }
  throw new ShareCodeRequestError("server");
}

/**
 * Name a definite failure by its code, or null when it's transient. A 400
 * without a code this client knows is a generic bad request.
 */
function definiteFailure(
  status: number,
  code: string | null
): ShareCodeFailure | null {
  switch (code) {
    case SHARE_CODE_ERRORS.invalidModeName:
      return "invalid-name";
    case SHARE_CODE_ERRORS.invalidOrg:
      return "org-invalid";
    case SHARE_CODE_ERRORS.badRequest:
    case SHARE_CODE_ERRORS.methodNotAllowed:
      return "bad-request";
    case SHARE_CODE_ERRORS.corruptModesRecord:
      return "corrupt-record";
    case SHARE_CODE_ERRORS.engineAuth:
      return "engine-auth";
    default:
      return status === 400 ? "bad-request" : null;
  }
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
      if (
        answer === null ||
        (data.home_org !== undefined && typeof data.home_org !== "string") ||
        typeof data.queried_org !== "string"
      ) {
        return null;
      }
      return {
        capability: "present",
        // Absent when the BFF withholds it (not the caller's own org).
        ...(typeof data.home_org === "string"
          ? { home_org: data.home_org }
          : {}),
        queried_org: data.queried_org,
        ...answer,
      };
    }
    default:
      return null;
  }
}
