import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as configApi from "@/lib/config-api";
import type { PromptOverrides } from "@/types/prompt-override";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const keys = {
  orgOverrides: ["org-overrides"] as const,
  modes: ["modes"] as const,
  mode: (name: string) => ["modes", name] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useOrgOverrides() {
  return useQuery({
    queryKey: keys.orgOverrides,
    queryFn: ({ signal }) => configApi.getOrgOverrides(signal),
  });
}

export function useModes() {
  return useQuery({
    queryKey: keys.modes,
    queryFn: ({ signal }) => configApi.listModes(signal),
  });
}

export function useMode(name: string | null) {
  return useQuery({
    queryKey: keys.mode(name ?? ""),
    queryFn: ({ signal }) => configApi.getMode(name!, signal),
    enabled: !!name,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpdateOrgOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: PromptOverrides) =>
      configApi.putOrgOverrides(overrides),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.orgOverrides });
    },
  });
}

export function useSaveMode() {
  const qc = useQueryClient();
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
    }) => configApi.putMode(name, body),
    onSuccess: (_data, { name }) => {
      void qc.invalidateQueries({ queryKey: keys.modes });
      void qc.invalidateQueries({ queryKey: keys.mode(name) });
    },
  });
}

// Note: publish/unpublish flows through useSaveMode with the full body
// (always send { label, description, document, published }). The worker
// PUT contract requires exactly one of `document` or `overrides` per
// request (worker #200 / PR #213), so the legacy partial-update path
// is no longer expressible. Mirrors the languages-side pattern — see
// `useSaveLanguage`.

export function useDeleteMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => configApi.deleteMode(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.modes });
    },
  });
}

export function useSetUserMode() {
  return useMutation({
    mutationFn: ({ userId, mode }: { userId: string; mode: string }) =>
      configApi.setUserMode(userId, mode),
  });
}

export function useClearUserMode() {
  return useMutation({
    mutationFn: (userId: string) => configApi.clearUserMode(userId),
  });
}
