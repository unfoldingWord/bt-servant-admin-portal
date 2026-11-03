import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getModeShareCode,
  MODE_SHARE_CODE_KEY,
} from "@/lib/mode-share-code-api";
import {
  shareCodeSnapshot,
  shareCodeStart,
  workerBehindPage,
  type ShareCodeStart,
} from "@/lib/mode-share-link";

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (other orgs' modes). A
// "behind" answer (the worker hasn't seen the page's latest save) is never
// reused: it is stale the moment it lands.
const SHARE_CODE_STALE_MS = 20_000;

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp, as a ShareCodeSnapshot for `resolveModeSharePanelState`.
//
// The panel mounts this once per open (a child keyed per open), so
// TanStack's per-observer state is per open: `isFetchedAfterMount` means
// "fetched in this open", and the unmount after close cancels a request
// still in flight (the query function reads `signal`). Every mode write
// invalidates it (`invalidateModeWrites` in use-prompt-config.ts), so a
// publish or group-chat toggle re-asks.
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null
) {
  const isEnabled = enabled && modeName !== "";
  const query = useQuery({
    queryKey: [...MODE_SHARE_CODE_KEY, org, modeName] as const,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: isEnabled,
    staleTime: (q) =>
      workerBehindPage(q.state.data) ? 0 : SHARE_CODE_STALE_MS,
    // Focus: off. Switching to a phone to scan the code and back must not
    // re-ask, and nothing a focus change implies makes the answer stale.
    refetchOnWindowFocus: false,
    // Reconnect: on. After being offline the answer may be out of date; the
    // refresh runs in the background over the answer on the card, and a
    // failed one keeps it (TanStack keeps `data` on a refetch error).
    refetchOnReconnect: true,
    // Transient outcomes throw and get the panel's Try again; automatic
    // retries would only delay showing them.
    retry: false,
  });
  const {
    data,
    dataUpdatedAt,
    fetchStatus,
    error,
    isFetchedAfterMount,
    refetch,
  } = query;

  // What the cache held the first time this mount asked (see
  // ShareCodeStart). Taken during render, once, so the very render that
  // starts asking already knows.
  const [start, setStart] = useState<ShareCodeStart | null>(null);
  const view = { data, dataUpdatedAt, fetchStatus, error, isFetchedAfterMount };
  const liveStart = start ?? (isEnabled ? shareCodeStart(view) : null);
  if (liveStart !== start) setStart(liveStart);

  const snapshot = useMemo(
    () =>
      shareCodeSnapshot(
        { data, dataUpdatedAt, fetchStatus, error, isFetchedAfterMount },
        liveStart ?? { fresh: false, dataUpdatedAt }
      ),
    [data, dataUpdatedAt, error, fetchStatus, isFetchedAfterMount, liveStart]
  );

  return { snapshot, refetch, fetchStatus };
}
