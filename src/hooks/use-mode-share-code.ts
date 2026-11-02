import { useQuery } from "@tanstack/react-query";

import { getModeShareCode } from "@/lib/mode-share-code-api";

/** Root of every share-code query, for invalidation after mode writes. */
export const MODE_SHARE_CODE_KEY = ["mode-share-code"] as const;

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (publish state, other
// orgs' modes). While a refetch is in flight the panel shows "checking"
// rather than offering Copy/Download on the answer being replaced.
const SHARE_CODE_STALE_MS = 20_000;

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp. Keyed on the flags the page last saved, and invalidated by
// every mode write (use-prompt-config.ts), so a publish, a group-chat
// toggle or a rename asks again instead of showing the answer from before.
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null,
  flags: { published?: boolean; requires_group?: boolean }
) {
  return useQuery({
    queryKey: [
      ...MODE_SHARE_CODE_KEY,
      org,
      modeName,
      flags.published === true,
      flags.requires_group === true,
    ] as const,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: enabled && modeName !== "",
    staleTime: SHARE_CODE_STALE_MS,
    refetchOnWindowFocus: false,
    // HTTP outcomes resolve to states with their own copy (and a Try
    // again where it helps); retries would only delay them.
    retry: false,
  });
}
