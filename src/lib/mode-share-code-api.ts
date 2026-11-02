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

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

/** Why the share-code request itself failed, so the panel can say so. */
export type ShareCodeFailure =
  /** 401: the session has ended. */
  | "signed-out"
  /** 403: the caller can't read this org's modes. */
  | "forbidden"
  /** 400 `invalid_mode_name` (worker), or a path the BFF couldn't decode. */
  | "invalid-name"
  /** 400 from the BFF's org resolution (`Invalid org…`). */
  | "org-invalid"
  /** Any other 400. */
  | "bad-request"
  /** 500 `corrupt_modes_record`: permanent until the record is repaired. */
  | "corrupt-record"
  /** Other 5xx, or a body this client can't read. */
  | "server"
  /** The request never got an answer. */
  | "network";

/**
 * Everything a share-code request can come back as: one of the route's
 * 200 bodies (the shared wire type), or a state this client derives from
 * the status.
 */
export type ModeShareCode =
  | ModeShareCodeResponse
  /** 503: the worker couldn't list or read modes just now; worth a retry. */
  | { capability: "unavailable" }
  /** 404 `mode_not_found`: no such mode in this org. */
  | { capability: "not-found" }
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
    return { capability: "failed", failure: "network" };
  }
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const error = typeof data?.error === "string" ? data.error : "";
  if (res.status === 503) return { capability: "unavailable" };
  if (res.status === 404) return { capability: "not-found" };
  if (!res.ok)
    return { capability: "failed", failure: failureFor(res.status, error) };
  return (
    parseShareCodeResponse(data) ?? { capability: "failed", failure: "server" }
  );
}

/** Name a non-OK, non-404/503 answer by its status and error body. */
function failureFor(status: number, error: string): ShareCodeFailure {
  if (status === 401) return "signed-out";
  if (status === 403) return "forbidden";
  if (status === 400) {
    if (error === SHARE_CODE_ERRORS.invalidModeName) return "invalid-name";
    // The BFF's own 400 for a path segment it couldn't decode.
    if (error === "Invalid mode name") return "invalid-name";
    // The BFF's resolveOrg: "Invalid org parameter" / "Invalid org".
    if (error.startsWith("Invalid org")) return "org-invalid";
    return "bad-request";
  }
  if (status === 500 && error === SHARE_CODE_ERRORS.corruptModesRecord) {
    return "corrupt-record";
  }
  return "server";
}

/** Read a 200 body into the wire type, or null when it isn't one. */
export function parseShareCodeResponse(
  data: Record<string, unknown> | null
): ModeShareCodeResponse | null {
  if (data === null) return null;
  switch (data.capability) {
    case "absent":
      return { capability: "absent", home: data.home === true };
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
