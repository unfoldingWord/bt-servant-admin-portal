import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { getModeShareCode, modeShareCodeKeys } from "@/lib/mode-share-code-api";
import {
  shareCodeSnapshot,
  shareCodeStart,
  answerNeverReused,
  type ShareCodeQueryView,
  type ShareCodeStart,
} from "@/lib/mode-share-link";

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (other orgs' modes). An
// unpublished / group-only answer is never reused: it may be the worker
// catching up with a save, so every look re-asks. Nor are "needs a newer
// BT Servant", "not found" and the definite failures (see
// `answerNeverReused`).
const SHARE_CODE_STALE_MS = 20_000;

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp, as a ShareCodeSnapshot for `resolveModeSharePanelState`.
//
// The panel mounts this once per open (a child keyed per open), so
// TanStack's per-observer state is per open: `isFetchedAfterMount` means
// "fetched in this open", and the unmount after close cancels a request
// still in flight (the query function reads `signal`). A mode write that
// can change a share code invalidates its org's (`invalidateShareCodes` in
// use-prompt-config.ts), so a publish or group-chat toggle re-asks.
//
// `org` is the page's org param (null = the caller's own org), the value
// its mode queries and writes use, so that invalidation finds this key.
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null
) {
  const isEnabled = enabled && modeName !== "";
  const queryKey = modeShareCodeKeys.mode(org, modeName);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: isEnabled,
    staleTime: (q) =>
      answerNeverReused(q.state.data) ? 0 : SHARE_CODE_STALE_MS,
    // Focus: off. Switching to a phone to scan the code and back must not
    // re-ask, and nothing a focus change implies makes the answer stale.
    refetchOnWindowFocus: false,
    // Reconnect: always, fresh or not. After being offline the answer may
    // be out of date; the refresh runs in the background over the answer on
    // the card, and a failed one keeps it (TanStack keeps `data` on a
    // refetch error).
    refetchOnReconnect: "always",
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

  // What the cache held the first time this mount asked for this key (see
  // ShareCodeStart). Taken during render, once per key, so the very render
  // that starts asking already knows; a key change (org or mode) takes a
  // new one.
  const startRef = useRef<{ key: string; start: ShareCodeStart } | null>(null);
  const view = useMemo<ShareCodeQueryView>(
    () => ({ data, dataUpdatedAt, fetchStatus, error, isFetchedAfterMount }),
    [data, dataUpdatedAt, error, fetchStatus, isFetchedAfterMount]
  );
  const keyString = JSON.stringify(queryKey);
  if (isEnabled && startRef.current?.key !== keyString) {
    startRef.current = { key: keyString, start: shareCodeStart(view) };
  }
  // Kept while disabled (the dialog closing) so the last answer stays
  // shown through the exit animation.
  const liveStart =
    startRef.current?.key === keyString ? startRef.current.start : null;

  const snapshot = useMemo(
    () =>
      shareCodeSnapshot(
        view,
        liveStart ?? { fresh: false, dataUpdatedAt: view.dataUpdatedAt }
      ),
    [view, liveStart]
  );

  return { snapshot, refetch, fetchStatus };
}
