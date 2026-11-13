import type {
  ApiKeyCreateInput,
  ApiKeyIssued,
  ApiKeyListResponse,
} from "@/types/api-keys";
import { buildConfigUrl } from "@/lib/config-url";
import { SAME_ORIGIN_HEADERS } from "@/lib/http";

// Client for the BFF's API keys routes (#354, worker/api-keys.ts). The BFF
// decides the org: the caller's own, or (super admins only) `?org=`. Nothing
// here can widen that — the client never sends an org in a body.

const PATH = "/api/config/api-keys";

/** Any non-2xx. `code` is the BFF's machine-readable code when it sent one. */
export class ApiKeysRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly serverMessage?: string,
    public readonly code?: string
  ) {
    super(serverMessage ?? `Request failed (${status})`);
    this.name = "ApiKeysRequestError";
  }
}

async function throwForStatus(res: Response): Promise<never> {
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON error body: fall back to the status alone.
  }
  throw new ApiKeysRequestError(res.status, body.error, body.code);
}

/**
 * One org's keys (the caller's own when `org` is null), or every org's when
 * `allOrgs` (super admins only; the BFF refuses anyone else).
 */
export async function listApiKeys(
  org: string | null,
  allOrgs: boolean,
  signal?: AbortSignal
): Promise<ApiKeyListResponse> {
  const base = buildConfigUrl(PATH, org);
  const url = allOrgs
    ? `${base}${base.includes("?") ? "&" : "?"}scope=all`
    : base;
  const res = await fetch(url, { headers: SAME_ORIGIN_HEADERS, signal });
  if (!res.ok) await throwForStatus(res);
  return (await res.json()) as ApiKeyListResponse;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwForStatus(res);
  return res;
}

export async function createApiKey(
  org: string | null,
  input: ApiKeyCreateInput
): Promise<ApiKeyIssued> {
  const res = await postJson(buildConfigUrl(PATH, org), input);
  return (await res.json()) as ApiKeyIssued;
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await postJson(`${PATH}/${encodeURIComponent(id)}/revoke`, {});
  await res.body?.cancel();
}

export async function rotateApiKey(
  id: string,
  graceSeconds: number
): Promise<ApiKeyIssued> {
  const res = await postJson(`${PATH}/${encodeURIComponent(id)}/rotate`, {
    graceSeconds,
  });
  return (await res.json()) as ApiKeyIssued;
}
