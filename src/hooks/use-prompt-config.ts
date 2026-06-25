import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as configApi from "@/lib/config-api";
import type { PromptOverrides } from "@/types/prompt-override";

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

export function useSaveMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string;
      body: {
        label?: string;
        description?: string;
        document: string;
        published?: boolean;
      };
    }) => configApi.putMode(name, body, undefined, key),
    onSuccess: (_data, { name }) => {
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(name, key) });
    },
  });
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

// Reslug a mode in place (#232). Invalidate the list plus BOTH the old and
// new per-mode caches: the old slug's entry is now stale (the engine keeps
// it only as an alias), and the new slug needs a fresh fetch so the editor
// re-syncs under the renamed identity.
export function useRenameMode(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      configApi.renameMode(name, newName, undefined, key),
    onSuccess: (_data, { name, newName }) => {
      void qc.invalidateQueries({ queryKey: keys.modes(key) });
      void qc.invalidateQueries({ queryKey: keys.mode(name, key) });
      void qc.invalidateQueries({ queryKey: keys.mode(newName, key) });
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
