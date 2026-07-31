import { useQuery } from "@tanstack/react-query";

import * as resourcesApi from "@/lib/resources-api";

// Org is part of every key so a super-admin's cross-org view doesn't collide
// with the same-org cache (same rule as use-languages). Language is a key
// segment too: the aggregation is resolved per-language on the worker side.
const keys = {
  resources: (language: string, org: string | null) =>
    ["resources", language, org] as const,
};

function normalize(org?: string | null): string | null {
  return org ?? null;
}

export function useResources(language: string | null, org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.resources(language ?? "", key),
    queryFn: ({ signal }) => resourcesApi.getResources(language!, signal, key),
    enabled: !!language,
  });
}
