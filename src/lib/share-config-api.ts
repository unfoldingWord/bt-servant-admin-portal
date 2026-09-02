// Client for the BFF's read-only share config (#311, `worker/share-config.ts`).

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export interface ShareConfig {
  /** Operator-entered WhatsApp number, not yet normalised. `null` = unset. */
  whatsappNumber: string | null;
  /** Org the WhatsApp gateway is pinned to. `null` = unknown. */
  whatsappOrg: string | null;
}

// Feature-detected: a portal build that predates the route answers 404, and
// the panel shows the same "not configured" state rather than an error
// (precedent: `src/lib/languages-api.ts` on worker#236).
export type ShareConfigResult =
  | { supported: true; config: ShareConfig }
  | { supported: false };

export async function getShareConfig(
  signal?: AbortSignal
): Promise<ShareConfigResult> {
  const res = await fetch("/api/share-config", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });
  if (res.status === 404 || res.status === 501) {
    return { supported: false };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load share config (${res.status}): ${body}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    supported: true,
    config: {
      whatsappNumber: stringOrNull(data.whatsapp_number),
      whatsappOrg: stringOrNull(data.whatsapp_org),
    },
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
