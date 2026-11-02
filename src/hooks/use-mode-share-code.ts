import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getModeShareCode,
  MODE_SHARE_CODE_KEY,
} from "@/lib/mode-share-code-api";
import {
  nextOpenMark,
  shareCodeSnapshot,
  workerBehindPage,
  type OpenMark,
} from "@/lib/mode-share-link";

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (other orgs' modes). A
// "behind" answer (the worker hasn't seen the page's latest save) is never
// reused: it is stale the moment it lands.
const SHARE_CODE_STALE_MS = 20_000;

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp, as a ShareCodeSnapshot for `resolveModeSharePanelState`. The
// panel only enables it for a published, non-group-only mode with a
// shareable slug. Every mode write invalidates it (`invalidateModeWrites`
// in use-prompt-config.ts), so a publish or group-chat toggle re-asks.
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null
) {
  const queryKey = [...MODE_SHARE_CODE_KEY, org, modeName] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: enabled && modeName !== "",
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
  const { data, dataUpdatedAt, isFetching, error, refetch } = query;

  // Open-detection, keyed on (open, queryKey) together (see OpenMark).
  // Updated during render, not in an effect, so the very render that opens
  // the panel, or switches key while open, already knows.
  const openKey = enabled ? JSON.stringify(queryKey) : null;
  const [mark, setMark] = useState<OpenMark>({ openKey, at: dataUpdatedAt });
  const next = nextOpenMark(mark, openKey, dataUpdatedAt);
  if (next !== mark) setMark(next);

  const snapshot = useMemo(
    () => shareCodeSnapshot({ data, dataUpdatedAt, isFetching, error }, next),
    [data, dataUpdatedAt, error, isFetching, next]
  );

  return { snapshot, refetch, fetching: isFetching };
}
