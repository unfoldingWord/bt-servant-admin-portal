import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as languagesApi from "@/lib/languages-api";

// Org is part of every key so a super-admin's cross-org view doesn't collide
// with the same-org cache. `null` is the canonical same-org placeholder.
const keys = {
  languages: (org: string | null) => ["languages", org] as const,
  language: (name: string, org: string | null) =>
    ["languages", name, org] as const,
  // NOT ["languages", "default", org]: `default` is a legal language slug,
  // so that key would collide with the per-language key for a language
  // literally named "default" — the same collision worker#236 avoided by
  // naming the route `languages-default` instead of `languages/default`.
  orgDefault: (org: string | null) => ["languages-default", org] as const,
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

// Org default language (#286). Read through its own endpoint rather than
// off the collection's `defaultLanguage` echo: the collection can't
// distinguish "no default" from "this worker predates worker#236", and the
// control must hide itself in the second case instead of asserting the org
// has no default.
//
// `retry: false` — the graceful-absence path already resolves (404/501 →
// `{ supported: false }`), so a rejection here is a genuine failure and
// retrying it three times only delays the panel.
export function useOrgDefaultLanguage(org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.orgDefault(key),
    queryFn: ({ signal }) => languagesApi.getOrgDefaultLanguage(signal, key),
    retry: false,
  });
}

// Set (`name`) or clear (`null`) the org default. Writes the server's echo
// straight into the cache so the badge and the notice flip immediately —
// the list invalidation that follows only refreshes the published flags the
// notice reads, and waiting for it would leave the control looking inert
// for a round-trip.
export function useSetOrgDefaultLanguage(org?: string | null) {
  const qc = useQueryClient();
  const key = normalize(org);
  return useMutation({
    mutationFn: (name: string | null) =>
      languagesApi.setOrgDefaultLanguage(name, undefined, key),
    onSuccess: (data) => {
      qc.setQueryData(keys.orgDefault(key), data);
      void qc.invalidateQueries({ queryKey: keys.languages(key) });
    },
  });
}
