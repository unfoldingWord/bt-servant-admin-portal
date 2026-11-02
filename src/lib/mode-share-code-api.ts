// Client for the BFF's per-mode share-code route (#345,
// `GET /api/config/modes/{name}/share-code`, worker/share-config.ts).
//
// The worker (bt-servant-worker#477) is the source of truth for which
// `#<code>` opens a mode on WhatsApp: it runs the chat path's own read,
// merge and classifier from the gateway org's point of view. The portal
// only renders its answer.

import { buildConfigUrl } from "@/lib/config-url";
import type { ModeShareCodeResponse } from "@/types/mode-share-code";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

/** Why the share-code request itself failed, so the panel can say so. */
export type ShareCodeFailure =
  /** 401: the session has ended. */
  | "signed-out"
  /** 403: the caller can't read this org's modes. */
  | "forbidden"
  /** 400 (e.g. the worker's `invalid_mode_name`). */
  | "invalid-name"
  /** 5xx other than 503, or a body this client can't read. */
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
  /** 503: the worker couldn't list modes just now; worth a retry. */
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
  if (res.status === 503) return { capability: "unavailable" };
  if (res.status === 404) return { capability: "not-found" };
  if (res.status === 401)
    return { capability: "failed", failure: "signed-out" };
  if (res.status === 403) return { capability: "failed", failure: "forbidden" };
  if (res.status === 400) {
    return { capability: "failed", failure: "invalid-name" };
  }
  if (!res.ok) return { capability: "failed", failure: "server" };
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return (
    parseShareCodeResponse(data) ?? {
      capability: "failed",
      failure: "server",
    }
  );
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
    case "unknown-home-org":
      return {
        capability: "unknown-home-org",
        home_org: typeof data.home_org === "string" ? data.home_org : "",
      };
    case "present":
      if (data.code !== null && typeof data.code !== "string") return null;
      if (typeof data.resolves !== "boolean") return null;
      return {
        capability: "present",
        code: data.code,
        resolves: data.resolves,
        ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
        ...(typeof data.resolved_org === "string"
          ? { resolved_org: data.resolved_org }
          : {}),
        ...(typeof data.home_has_modes === "boolean"
          ? { home_has_modes: data.home_has_modes }
          : {}),
        home_org: typeof data.home_org === "string" ? data.home_org : "",
      };
    default:
      return null;
  }
}
