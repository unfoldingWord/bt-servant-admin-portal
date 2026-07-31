import type { AggregatedResourcesResponse } from "@/types/resources";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

// Unlike the other config APIs this endpoint carries a required `language`
// query param alongside the optional super-admin `?org=`, so it builds its
// query string with URLSearchParams instead of buildConfigUrl (which owns
// the single-param case). Same org semantics: blank/whitespace orgs are
// dropped rather than appended (see lib/config-url.ts for the rationale).
export async function getResources(
  language: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<AggregatedResourcesResponse> {
  const params = new URLSearchParams({ language });
  const trimmedOrg = org?.trim();
  if (trimmedOrg) params.set("org", trimmedOrg);

  const res = await fetch(`/api/config/resources?${params.toString()}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load resources (${res.status}): ${body}`);
  }

  return (await res.json()) as AggregatedResourcesResponse;
}
