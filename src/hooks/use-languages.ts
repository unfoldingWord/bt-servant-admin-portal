import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as languagesApi from "@/lib/languages-api";

const keys = {
  languages: ["languages"] as const,
  language: (name: string) => ["languages", name] as const,
};

export function useLanguages() {
  return useQuery({
    queryKey: keys.languages,
    queryFn: ({ signal }) => languagesApi.listLanguages(signal),
  });
}

export function useLanguage(name: string | null) {
  return useQuery({
    queryKey: keys.language(name ?? ""),
    queryFn: ({ signal }) => languagesApi.getLanguage(name!, signal),
    enabled: !!name,
  });
}

export function useSaveLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string;
      body: { label?: string; document: string; published?: boolean };
    }) => languagesApi.putLanguage(name, body),
    onSuccess: (_data, { name }) => {
      void qc.invalidateQueries({ queryKey: keys.languages });
      void qc.invalidateQueries({ queryKey: keys.language(name) });
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

export function useDeleteLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => languagesApi.deleteLanguage(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.languages });
    },
  });
}
