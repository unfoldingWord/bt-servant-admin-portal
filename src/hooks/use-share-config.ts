import { useQuery } from "@tanstack/react-query";

import { getShareConfig } from "@/lib/share-config-api";

// Operator config that changes on deploy, not on user action: cache it for
// the session and never refetch on focus. A stale number would only show
// after a redeploy the user already has to reload for.
export function useShareConfig(enabled = true) {
  return useQuery({
    queryKey: ["share-config"] as const,
    queryFn: ({ signal }) => getShareConfig(signal),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
