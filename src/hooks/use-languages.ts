import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as languagesApi from "@/lib/languages-api";

// Org is part of every key so a super-admin's cross-org view doesn't collide
// with the same-org cache. `null` is the canonical same-org placeholder.
const keys = {
  languages: (org: string | null) => ["languages", org] as const,
  language: (name: string, org: string | null) =>
    ["languages", name, org] as const,
};

function normalize(org?: string | null): string | null {
  return org ?? null;
}

export function useLanguages(org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.languages(key),
    queryFn: ({ signal }) => languagesApi.listLanguages(signal, key),
  });
}

export function useLanguage(name: string | null, org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.language(name ?? "", key),
    queryFn: ({ signal }) => languagesApi.getLanguage(name!, signal, key),
    enabled: !!name,
  });
}

export function useSaveLanguage(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string;
      body: { label?: string; document: string; published?: boolean };
    }) => languagesApi.putLanguage(name, body, undefined, key),
    onSuccess: (_data, { name }) => {
      void qc.invalidateQueries({ queryKey: keys.languages(key) });
      void qc.invalidateQueries({ queryKey: keys.language(name, key) });
    },
  });
}

// Note: publish/unpublish flows through useSaveLanguage with the full body
// (always send { label, document, published }). Languages don't need the
// partial-update racing fix that modes use because there's only one
// editable field (the document) — there's no "concurrent slot save" hazard.
//
// If concurrent editing across browser tabs becomes a problem, revisit by
// either (a) loosening the engine PUT contract to make `document` optional
// or (b) introducing optimistic concurrency via etag/version.

export function useDeleteLanguage(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: (name: string) =>
      languagesApi.deleteLanguage(name, undefined, key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.languages(key) });
    },
  });
}
