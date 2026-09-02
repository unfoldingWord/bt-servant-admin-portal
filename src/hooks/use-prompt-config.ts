import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import * as configApi from "@/lib/config-api";
import type {
  OrgModes,
  PromptMode,
  PromptOverrides,
} from "@/types/prompt-override";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
//
// Org is part of every key so a super-admin's cross-org view doesn't collide
// with the same-org cache. `null` is the canonical same-org placeholder (so
// `null` and an undefined-passing call from a legacy caller hash to the
// same entry — see #166 PR B).

const keys = {
  orgOverrides: (org: string | null) => ["org-overrides", org] as const,
  modes: (org: string | null) => ["modes", org] as const,
  mode: (name: string, org: string | null) => ["modes", name, org] as const,
};

// Exported for unit tests that assert cache effects by key.
export const modeQueryKeys = keys;

function normalize(org?: string | null): string | null {
  return org ?? null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useOrgOverrides(org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.orgOverrides(key),
    queryFn: ({ signal }) => configApi.getOrgOverrides(signal, key),
  });
}

export function useModes(org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.modes(key),
    queryFn: ({ signal }) => configApi.listModes(signal, key),
  });
}

export function useMode(name: string | null, org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.mode(name ?? "", key),
    queryFn: ({ signal }) => configApi.getMode(name!, signal, key),
    enabled: !!name,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpdateOrgOverrides(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: (overrides: PromptOverrides) =>
      configApi.putOrgOverrides(overrides, undefined, key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.orgOverrides(key) });
    },
  });
}

export interface ModeSaveTarget {
  name: string;
  body: {
    label?: string;
    description?: string;
    document: string;
    published?: boolean;
    requires_group?: boolean;
  };
  /**
   * The org the PUT targets, pinned by the CALLER at the moment the action
   * started — same rule as `languageSaveMutationOptions` (#286). TanStack
   * replaces a live mutation's options on every re-render, so a closure-read
   * org would hand the settled callbacks whatever org is ambient when the
   * PUT lands. The org-context dialog offers "Discard and switch" WHILE a
   * save is in flight, so that is a reachable path, not a theoretical one:
   * org A's completed save would invalidate org B and leave A's cache
   * holding the pre-save document. Used for the PUT, the seed, AND the
   * invalidation, so the three can never name different orgs (codex+grok
   * #315 rd-2).
   */
  org: string | null;
  /**
   * Opt-in cache seed for a PUT that targets a mode the editor is NOT
   * (necessarily) showing — import (#198) and create (#308). When set, the
   * PUT response is written into the TARGET mode's per-mode cache AND
   * upserted into the list cache INSIDE this hook's `onSuccess`, which
   * TanStack awaits BEFORE it flips `isPending` and before any mutate-level
   * `onSuccess`/`onSettled` runs (`@tanstack/query-core` mutation.ts:
   * `await this.options.onSuccess`, then `dispatch({type:'success'})`). That
   * ordering is the point: the page's save lock and the Import button's
   * busy gate both release on settle, and the import gate classifies from
   * the live list — so the row must already be in the cache when either
   * releases (codex+grok #315 rd-1). A seed done from the mutate-level
   * callback lands too late.
   *
   * Absent for the editor's ordinary saves (autosave, flag toggles, priority
   * apply, label sync): those target the SELECTED mode, whose trackers are
   * advanced from the response by the page, and #306 deliberately kept the
   * shared save path free of cache seeding.
   */
  seed?: true;
}

// Exported so the cache effects can be tested against a real QueryClient
// without React (same shape as `languageSaveMutationOptions`).
export function saveModeMutationOptions(qc: QueryClient) {
  return {
    mutationFn: ({ name, body, org }: ModeSaveTarget) =>
      configApi.putMode(name, body, undefined, org),
    onSuccess: async (
      saved: PromptMode,
      { name, org, seed }: ModeSaveTarget
    ) => {
      const key = normalize(org);
      if (seed) {
        // AWAIT the cancel before seeding (TanStack's optimistic-update
        // order): an in-flight GET that settles AFTER setQueryData would
        // write the pre-save row straight back into the cache.
        await qc.cancelQueries({ queryKey: keys.mode(name, key) });
        qc.setQueryData(keys.mode(name, key), saved);
        // Upsert the LIST too, so a just-created slug is immediately present
        // in the dropdown AND classified `existing` by the import gate —
        // otherwise a same-slug import before the list refetch lands takes
        // the create path and clobbers the first write with no overwrite
        // confirm (grok #306 rd-5). For create it is also what keeps the
        // page's stale-selection guard from nulling the just-selected slug
        // in the render gap before the refetch lands (the gap
        // clone/rename/retire close in their onSuccess). Cancel the list GET
        // first so a pre-write response can't drop the row.
        await qc.cancelQueries({ queryKey: keys.modes(key) });
        qc.setQueryData<OrgModes>(keys.modes(key), (prev) =>
          applyCloneToModeList(prev, saved)
        );
      }
      // Invalidate AFTER any seed, and for the SAME pinned org: a refetch
      // started here captures the seeded state as its revert baseline, and
      // reconciles the optimistic rows with server truth (e.g. fresh
      // `aliases`).
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(name, key) });
    },
  };
}

export function useSaveMode() {
  return useMutation(saveModeMutationOptions(useQueryClient()));
}

// Read the cached org mode list SYNCHRONOUSLY, outside the render cycle
// (#308). The import flow decides create-vs-overwrite and alias collisions
// from this list at two points — after the OS file picker returns, and again
// on overwrite-confirm — and both run in async continuations where the render
// closure's `modesQuery.data` can predate a mutation that has since seeded or
// refetched the cache. `getQueryData` is the live cache: every seed below
// (`setQueryData`) and every settled refetch is visible to it in the same
// tick. Returns `undefined` when nothing is cached for that org so the caller
// can fail closed.
export function useReadModeList() {
  const qc = useQueryClient();
  return useCallback(
    (org: string | null): OrgModes | undefined =>
      qc.getQueryData<OrgModes>(keys.modes(normalize(org))),
    [qc]
  );
}

// Note: publish/unpublish flows through useSaveMode with the full body
// (always send { label, description, document, published }). The worker
// PUT contract requires exactly one of `document` or `overrides` per
// request (worker #200 / PR #213), so the legacy partial-update path
// is no longer expressible. Mirrors the languages-side pattern — see
// `useSaveLanguage`.

export function useDeleteMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: (name: string) => configApi.deleteMode(name, undefined, key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
    },
  });
}

// Append (or replace) the cloned mode in a cached modes list. Exported
// for unit tests. Returns `prev` untouched when nothing is cached yet
// (`undefined`) so an optimistic write never fabricates a list. If the
// new slug already exists in the cache (a rare tab-race with an
// overlapping refetch, or a stale entry from a concurrent write), the
// entry is replaced in-place rather than duplicated — the modes-list
// selector keys on `m.name` and a duplicate would surface as a React
// key collision.
export function applyCloneToModeList(
  prev: OrgModes | undefined,
  cloned: PromptMode
): OrgModes | undefined {
  if (!prev) return prev;
  const existingIdx = prev.modes.findIndex((m) => m.name === cloned.name);
  if (existingIdx >= 0) {
    return {
      ...prev,
      modes: prev.modes.map((m, i) => (i === existingIdx ? cloned : m)),
    };
  }
  return { ...prev, modes: [...prev.modes, cloned] };
}

// Swap the old-slug entry for the renamed mode in a cached modes list.
// Exported for unit tests. Returns `prev` untouched when nothing is cached
// yet (`undefined`) or the old slug isn't present, so an optimistic write
// never fabricates a list.
export function applyRenameToModeList(
  prev: OrgModes | undefined,
  oldName: string,
  renamed: PromptMode
): OrgModes | undefined {
  if (!prev) return prev;
  return {
    ...prev,
    modes: prev.modes.map((m) => (m.name === oldName ? renamed : m)),
  };
}

// Reslug a mode in place (#232). Two-part cache update:
//
//  1. Synchronously swap the old-slug entry for the returned renamed mode
//     in the LIST cache. The page selects the new slug immediately after
//     this mutation resolves (`setSelectedMode(newName)` in modes.tsx);
//     without this optimistic write the list still holds the old slug in
//     the render gap before the refetch lands, and the stale-selection
//     guard there (`modes.tsx`) would see `newName` missing and null the
//     selection — dropping the user into "no mode" right after a
//     successful rename.
//  2. Invalidate the list and BOTH per-mode caches so the optimistic
//     entry is reconciled with server truth (e.g. fresh `aliases`) and
//     the old slug's now-stale entry is dropped.
export function useRenameMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      configApi.renameMode(name, newName, undefined, key),
    onSuccess: (data, { name, newName }) => {
      qc.setQueryData<OrgModes>(keys.modes(key), (prev) =>
        applyRenameToModeList(prev, name, data)
      );
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(name, key) });
      void qc.invalidateQueries({ queryKey: keys.mode(newName, key) });
    },
  });
}

// Clone a mode (#241 PR B). Three-part cache update mirroring the shape
// of `useRenameMode` — needed because the page follows selection to the
// new slug on success (`setSelectedMode(data.name)` in modes.tsx) and
// the stale-selection guard there wipes the selection if the list cache
// hasn't caught up:
//
//  1. Synchronously append the returned clone to the LIST cache via
//     `applyCloneToModeList`. Without this optimistic write the list
//     still holds the pre-clone snapshot in the render gap before the
//     refetch lands; the guard sees the new slug missing and drops the
//     user to no selection (#241 PR B Frank F2).
//  2. Pre-write the returned clone into the per-mode cache so the page
//     renders the fresh mode without a loading spinner.
//  3. Invalidate the list and the per-mode cache so the optimistic
//     writes reconcile with server truth.
export function useCloneMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({
      name,
      newName,
      newLabel,
    }: {
      name: string;
      newName: string;
      newLabel?: string;
    }) => configApi.cloneMode(name, { newName, newLabel }, undefined, key),
    onSuccess: (data) => {
      qc.setQueryData<OrgModes>(keys.modes(key), (prev) =>
        applyCloneToModeList(prev, data)
      );
      qc.setQueryData(keys.mode(data.name, key), data);
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(data.name, key) });
    },
    onError: (error) => {
      // #258 rd-2 P2 — a collision carrying granted verbs means a prior
      // attempt's engine create COMMITTED while its response was lost:
      // the colliding mode exists server-side but this client's list
      // cache predates it. Refetch so the reconciled rights (mirrored
      // by the page) have a list entry to surface.
      if (
        error instanceof configApi.CloneCollisionError &&
        error.grantedVerbs
      ) {
        void qc.invalidateQueries({ queryKey: keys.modes(key) });
      }
    },
  });
}

// Apply a retire-and-forward to the cached modes list. Exported for
// unit tests. Removes the SOURCE (`sourceName`) entry and replaces the
// TARGET entry with the response's `target` (which now carries the
// source's slug + the source's own aliases in its own `aliases`
// array). Returns `prev` untouched when nothing is cached yet so an
// optimistic write never fabricates a list. If either the source or
// target isn't present, that individual step is a no-op — the source
// removal is idempotent, the target replace matches on name.
export function applyRetireToModeList(
  prev: OrgModes | undefined,
  sourceName: string,
  target: PromptMode
): OrgModes | undefined {
  if (!prev) return prev;
  return {
    ...prev,
    modes: prev.modes
      .filter((m) => m.name !== sourceName)
      .map((m) => (m.name === target.name ? target : m)),
  };
}

// Retire a mode and forward its users to another mode via the engine's
// `_retire` op (#241 PR C). Three-part cache update:
//
//  1. Synchronously rewrite the LIST cache via `applyRetireToModeList`
//     — the source is removed, the target's entry is replaced with the
//     response (now widened aliases). Without the optimistic write the
//     page's stale-selection guard would fire on the source's slug in
//     the render gap after the page's `handleSelectMode(target.name)`.
//  2. Overwrite the target's per-mode cache with the response so the
//     editor renders the updated alias set without a loading gap. Drop
//     the source's per-mode cache entry so a subsequent stale read
//     doesn't resurrect it.
//  3. Invalidate the list + both per-mode caches so the optimistic
//     writes reconcile with server truth.
export function useRetireMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({ name, forwardTo }: { name: string; forwardTo: string }) =>
      configApi.retireMode(name, forwardTo, undefined, key),
    onSuccess: (data, { name }) => {
      qc.setQueryData<OrgModes>(keys.modes(key), (prev) =>
        applyRetireToModeList(prev, name, data)
      );
      qc.setQueryData(keys.mode(data.name, key), data);
      qc.removeQueries({ queryKey: keys.mode(name, key) });
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(data.name, key) });
    },
  });
}

export function useSetUserMode(org?: string | null) {
  const key = normalize(org);
  return useMutation({
    mutationFn: ({ userId, mode }: { userId: string; mode: string }) =>
      configApi.setUserMode(userId, mode, undefined, key),
  });
}

export function useClearUserMode(org?: string | null) {
  const key = normalize(org);
  return useMutation({
    mutationFn: (userId: string) =>
      configApi.clearUserMode(userId, undefined, key),
  });
}
