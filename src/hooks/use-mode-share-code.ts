import { useQuery } from "@tanstack/react-query";

import { getModeShareCode } from "@/lib/mode-share-code-api";

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp. Unlike the share config this depends on live data (publish
// state, other orgs' modes), so it is refetched on every open and keyed on
// the flags the page last saved: a publish or a group-chat toggle asks
// again rather than showing the answer from before it.
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null,
  flags: { published?: boolean; requires_group?: boolean }
) {
  return useQuery({
    queryKey: [
      "mode-share-code",
      org,
      modeName,
      flags.published === true,
      flags.requires_group === true,
    ] as const,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: enabled && modeName !== "",
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    // A 503 resolves to `unavailable` with its own Try again; what throws
    // is 401/5xx, which retries would only delay.
    retry: false,
  });
}
