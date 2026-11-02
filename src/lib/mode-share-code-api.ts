// Client for the BFF's per-mode share-code route (#345,
// `GET /api/config/modes/{name}/share-code`, worker/share-config.ts).
//
// The worker (bt-servant-worker#477) is the source of truth for which
// `#<code>` opens a mode on WhatsApp: it runs the chat path's own read,
// merge and classifier from the gateway org's point of view. The portal
// only renders its answer.

import { buildConfigUrl } from "@/lib/config-url";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

/**
 * Why the worker's code does not (or cannot) open the mode. The known
 * values are listed; the contract is additive, so any other string is
 * possible and reads as "does not open this mode".
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
  | "pending";
export type ShareCodeReason = KnownShareCodeReason | (string & {});

export type ModeShareCode =
  /** The worker answered. `code` is the token without `#`. */
  | {
      capability: "present";
      code: string | null;
      resolves: boolean;
      reason?: ShareCodeReason;
      /** Raw org of the mode `#<code>` actually opens. */
      resolvedOrg?: string;
    }
  /**
   * The worker predates the route. `home` is true when the mode's org is
   * the gateway org (decided by the BFF on the exact org it resolved).
   */
  | { capability: "absent"; home: boolean }
  /** WHATSAPP_ORG is unset for this environment. */
  | { capability: "unconfigured" }
  /** WHATSAPP_ORG names an org the worker has no modes for. */
  | { capability: "unknown-home-org"; homeOrg: string }
  /** The worker could not list modes just now (503); worth a retry. */
  | { capability: "unavailable" }
  /** The worker has no such mode in this org (404 `mode_not_found`). */
  | { capability: "not-found" };

export async function getModeShareCode(
  modeName: string,
  org: string | null | undefined,
  signal?: AbortSignal
): Promise<ModeShareCode> {
  const res = await fetch(
    buildConfigUrl(
      `/api/config/modes/${encodeURIComponent(modeName)}/share-code`,
      org
    ),
    { headers: SAME_ORIGIN_HEADERS, signal }
  );
  if (res.status === 503) return { capability: "unavailable" };
  if (res.status === 404) return { capability: "not-found" };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load the share code (${res.status}): ${body}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  switch (data.capability) {
    case "absent":
      return { capability: "absent", home: data.home === true };
    case "unconfigured":
      return { capability: "unconfigured" };
    case "unknown-home-org":
      return {
        capability: "unknown-home-org",
        homeOrg: typeof data.home_org === "string" ? data.home_org : "",
      };
    case "present":
      return {
        capability: "present",
        code: typeof data.code === "string" ? data.code : null,
        resolves: data.resolves === true,
        ...(typeof data.reason === "string" ? { reason: data.reason } : {}),
        ...(typeof data.resolved_org === "string"
          ? { resolvedOrg: data.resolved_org }
          : {}),
      };
    default:
      throw new Error("Malformed share-code response");
  }
}
