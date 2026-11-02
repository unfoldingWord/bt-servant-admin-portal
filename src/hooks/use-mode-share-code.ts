import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getModeShareCode } from "@/lib/mode-share-code-api";
import {
  isTransientShareCode,
  shareCodeDisagreesWithFlags,
} from "@/lib/mode-share-link";

/** Root of every share-code query, for invalidation after mode writes. */
export const MODE_SHARE_CODE_KEY = ["mode-share-code"] as const;

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (publish state, other
// orgs' modes). A transient failure, or an answer that contradicts the
// page's saved flags, is never reused: it is stale the moment it lands.
const SHARE_CODE_STALE_MS = 20_000;

// The worker's KV reads are eventually consistent, so right after a
// publish or group-chat toggle it can still answer from before the save.
// When its answer contradicts the page's flags, ask once more after this
// delay; after that the panel says the worker is behind and offers Try
// again rather than polling.
const DISAGREEMENT_RETRY_MS = 4_000;

type Flags = { published?: boolean; requires_group?: boolean };

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp. Keyed on the flags the page last saved, and invalidated by
// every mode write (`invalidateModeWrites` in use-prompt-config.ts).
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null,
  flags: Flags
) {
  const queryKey = [
    ...MODE_SHARE_CODE_KEY,
    org,
    modeName,
    flags.published === true,
    flags.requires_group === true,
  ] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: enabled && modeName !== "",
    staleTime: (q) => {
      const data = q.state.data;
      return isTransientShareCode(data) ||
        shareCodeDisagreesWithFlags(data, flags)
        ? 0
        : SHARE_CODE_STALE_MS;
    },
    // Focus: off. Switching to a phone to scan the code and back must not
    // re-ask, and nothing a focus change implies makes the answer stale.
    refetchOnWindowFocus: false,
    // Reconnect: on. After being offline the answer may be out of date; the
    // refresh runs in the background over the answer already shown, and a
    // failed one keeps it (see `shareCodeToShow`).
    refetchOnReconnect: true,
    // HTTP outcomes resolve to states with their own copy (and a Try
    // again where it helps); retries would only delay them.
    retry: false,
  });

  // The one automatic re-ask after a disagreement, per key and per open.
  const keyId = JSON.stringify(queryKey);
  const [autoRetriedKey, setAutoRetriedKey] = useState<string | null>(null);
  const autoRetried = autoRetriedKey === keyId;
  const disagrees = shareCodeDisagreesWithFlags(query.data, flags);
  const { refetch, isFetching } = query;
  useEffect(() => {
    if (!enabled) {
      setAutoRetriedKey(null);
      return;
    }
    if (!disagrees || autoRetried || isFetching) return;
    const timer = setTimeout(() => {
      setAutoRetriedKey(keyId);
      void refetch();
    }, DISAGREEMENT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [autoRetried, disagrees, enabled, isFetching, keyId, refetch]);

  return { query, autoRetried };
}
