import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMode } from "@/lib/config-api";
import { readModeFlags, type ModeFlags } from "@/lib/mode-flags";
import {
  getModeShareCode,
  MODE_SHARE_CODE_KEY,
  ShareCodeRequestError,
} from "@/lib/mode-share-code-api";
import {
  shareCodeDisagreesWithFlags,
  type ShareCodeSnapshot,
} from "@/lib/mode-share-link";
import { modeQueryKeys } from "@/hooks/use-prompt-config";

// Reusing an answer briefly keeps close-and-reopen instant; past that it
// is refetched, because it depends on live data (publish state, other
// orgs' modes). An answer that contradicts the page's saved flags is
// never reused: it is stale the moment it lands.
const SHARE_CODE_STALE_MS = 20_000;

// The worker's KV reads are eventually consistent, and the page's flags
// are only as fresh as the last save or selection. When the two disagree,
// wait this long, then re-read BOTH the mode record and the share code
// once (see `recheck`).
const DISAGREEMENT_RETRY_MS = 4_000;

type Flags = Pick<ModeFlags, "published" | "requires_group">;

interface Recheck {
  /** The query key the recheck belongs to. */
  key: string;
  status: "running" | "done";
  /** The mode's flags as just re-read from the server; null if that read failed. */
  serverFlags: Flags | null;
}

// #345 — the worker's answer for which `#<code>` opens this mode on
// WhatsApp, as a ShareCodeSnapshot for `resolveModeSharePanelState`. Keyed
// on the flags the page last saved, and invalidated by every mode write
// (`invalidateModeWrites` in use-prompt-config.ts).
export function useModeShareCode(
  enabled: boolean,
  modeName: string,
  org: string | null,
  pageFlags: Flags
) {
  const qc = useQueryClient();
  const queryKey = [
    ...MODE_SHARE_CODE_KEY,
    org,
    modeName,
    pageFlags.published === true,
    pageFlags.requires_group === true,
  ] as const;
  const keyId = JSON.stringify(queryKey);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getModeShareCode(modeName, org, signal),
    enabled: enabled && modeName !== "",
    staleTime: (q) =>
      shareCodeDisagreesWithFlags(q.state.data, pageFlags)
        ? 0
        : SHARE_CODE_STALE_MS,
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

  // First load vs background refresh. When the panel opens, a cached answer
  // that is already stale is about to be replaced: remember its
  // `dataUpdatedAt`, and treat only data newer than that as current for
  // this open. So a reopen past the stale time shows "checking" (never
  // Copy/Download on the old answer), while any later refetch is a
  // background one over the answer already on the card.
  const { data, dataUpdatedAt, isStale, isFetching, error, refetch } = query;
  const [staleBefore, setStaleBefore] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setStaleBefore(null);
      return;
    }
    setStaleBefore((prev) => prev ?? (isStale ? dataUpdatedAt : -1));
  }, [enabled, isStale, dataUpdatedAt]);
  const current =
    data !== undefined &&
    (staleBefore === null ? !isStale : dataUpdatedAt > staleBefore);

  // Page flags vs the worker's answer. On a disagreement neither side is
  // assumed stale: after a short wait, re-read the mode record AND the
  // share code. If the re-read record agrees with the worker, its answer
  // is shown; only if they still disagree is the worker called behind.
  const [recheck, setRecheck] = useState<Recheck | null>(null);
  const ownRecheck = recheck?.key === keyId ? recheck : null;
  const runRecheck = useCallback(async () => {
    setRecheck({ key: keyId, status: "running", serverFlags: null });
    const [mode] = await Promise.allSettled([
      qc.fetchQuery({
        queryKey: modeQueryKeys.mode(modeName, org),
        queryFn: ({ signal }) => getMode(modeName, signal, org),
        staleTime: 0,
      }),
      refetch(),
    ]);
    setRecheck({
      key: keyId,
      status: "done",
      serverFlags:
        mode.status === "fulfilled" ? readModeFlags(mode.value) : null,
    });
  }, [keyId, modeName, org, qc, refetch]);

  const answer = current ? data : undefined;
  const pageDisagrees = shareCodeDisagreesWithFlags(answer, pageFlags);
  useEffect(() => {
    if (!enabled) {
      setRecheck(null);
      return;
    }
    if (!pageDisagrees || ownRecheck !== null || isFetching) return;
    const timer = setTimeout(() => void runRecheck(), DISAGREEMENT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [enabled, isFetching, ownRecheck, pageDisagrees, runRecheck]);

  let sync: ShareCodeSnapshot["sync"] = "agree";
  if (ownRecheck?.status === "running") {
    sync = "checking";
  } else if (ownRecheck?.status === "done") {
    const flags = ownRecheck.serverFlags ?? pageFlags;
    sync = shareCodeDisagreesWithFlags(answer, flags) ? "behind" : "agree";
  } else if (pageDisagrees) {
    sync = "checking";
  }

  const snapshot: ShareCodeSnapshot = {
    answer,
    // No current answer and no failure yet also counts: on the render that
    // opens the panel the fetch hasn't registered as running, and that
    // moment must read as "checking", not as a failure.
    checking: !current && (isFetching || error === null),
    failure:
      error === null
        ? null
        : error instanceof ShareCodeRequestError
          ? error.kind
          : "server",
    sync,
  };

  /** Try again: the share code, plus the mode record when they disagreed. */
  const retry = useCallback(() => {
    if (ownRecheck !== null || pageDisagrees) void runRecheck();
    else void refetch();
  }, [ownRecheck, pageDisagrees, refetch, runRecheck]);

  return {
    snapshot,
    retry,
    retrying: isFetching || ownRecheck?.status === "running",
  };
}
