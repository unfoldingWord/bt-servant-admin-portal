import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import * as languagesApi from "@/lib/languages-api";
import type {
  Language,
  OrgDefaultLanguage,
  OrgLanguages,
} from "@/types/language";

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

export interface LanguageSaveTarget {
  name: string;
  body: { label?: string; document: string; published?: boolean };
  org: string | null;
}

// Org pinned in the VARIABLES, same rule as the delete/default mutations
// (#286 review rd-2 P2-2). The org-context switch dialog offers "Discard
// and switch" while a save is in flight, so this is a reachable path, not
// a theoretical one: the PUT for org A settles after the ambient key has
// become B, and a closure-read key would invalidate B while leaving A's
// cache holding the pre-save document — a completed save looking lost,
// and the next edit from that stale base overwriting it for real.
export function languageSaveMutationOptions(qc: QueryClient) {
  return {
    mutationFn: ({ name, body, org }: LanguageSaveTarget) =>
      languagesApi.putLanguage(name, body, undefined, org),
    onSuccess: async (saved: Language, { name, org }: LanguageSaveTarget) => {
      // Seed the per-language cache with the saved row rather than only
      // invalidating: an invalidated but inactive detail query keeps serving
      // its PRE-save document, so a later select — auto or manual — paints the
      // old doc, the sync effect pins it, and the next edit saves it back over
      // what we just wrote (grok rd-3). putLanguage returns a full Language
      // (matches getLanguage), so this is the authoritative post-save state,
      // org pinned via the variables.
      //
      // AWAIT the cancel before seeding (TanStack's optimistic-update order):
      // an in-flight getLanguage that settles AFTER setQueryData would write
      // the pre-save document straight back into the cache (grok rd-4).
      await qc.cancelQueries({ queryKey: keys.language(name, org) });
      qc.setQueryData(keys.language(name, org), saved);
      // Upsert the row into the collection cache in the same tick, so a
      // just-created slug is immediately `existing` for the next create.
      // Without this, until the list refetch lands, re-creating the slug
      // classifies as a fresh create and silently overwrites it (grok rd-5).
      // Cancel the list GET first for the same reason as the detail seed: an
      // in-flight `/languages` started before this row existed would settle
      // after the upsert and drop it again (grok rd-6).
      await qc.cancelQueries({ queryKey: keys.languages(org) });
      qc.setQueryData<OrgLanguages>(keys.languages(org), (old) =>
        old
          ? {
              ...old,
              languages: old.languages.some((l) => l.name === saved.name)
                ? old.languages.map((l) => (l.name === saved.name ? saved : l))
                : [...old.languages, saved],
            }
          : old
      );
      void qc.invalidateQueries({ queryKey: keys.languages(org) });
    },
  };
}

export function useSaveLanguage() {
  return useMutation(languageSaveMutationOptions(useQueryClient()));
}

// Note: publish/unpublish flows through useSaveLanguage with the full body
// (always send { label, document, published }). Languages don't need the
// partial-update racing fix that modes use because there's only one
// editable field (the document) — there's no "concurrent slot save" hazard.
//
// If concurrent editing across browser tabs becomes a problem, revisit by
// either (a) loosening the engine PUT contract to make `document` optional
// or (b) introducing optimistic concurrency via etag/version.

// The org travels in the mutation VARIABLES, not in a closure over the
// hook's argument (#286 review): TanStack updates a live mutation's
// options on every re-render, so an org-context switch made while a write
// is in flight would hand the settled callback the NEW org's cache key —
// applying one org's outcome to another org's data. Pinning the target at
// mutate time makes that structurally impossible; the page's dirty-guard
// (which now also gates on these mutations being pending) is the first
// line of defense, this is the second.
export interface LanguageMutationTarget {
  name: string;
  org: string | null;
}

// Built as a standalone options object (and exported) so a test can drive
// the exact wiring the hook uses — proving the request target and the
// cache write both come from the VARIABLES, with no ambient key anywhere
// in the path.
export function languageDeleteMutationOptions(qc: QueryClient) {
  return {
    mutationFn: ({ name, org }: LanguageMutationTarget) =>
      languagesApi.deleteLanguage(name, undefined, org),
    onSuccess: (_data: void, { org }: LanguageMutationTarget) =>
      applyLanguageDeletionToCache(qc, org),
  };
}

export function useDeleteLanguage() {
  return useMutation(languageDeleteMutationOptions(useQueryClient()));
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
// waiting for a refetch would leave the control looking inert for a round
// trip — and THEN invalidates, so the optimistic value is reconciled
// against the server rather than trusted indefinitely. Order matters:
// setQueryData first (instant paint), invalidate second (the correction,
// including for the echo-shape guess in `setOrgDefaultLanguage`).
// Same mutate-time pinning as useDeleteLanguage, and for a sharper
// reason: this mutation WRITES to the cache. A super admin who hits "Set
// as default" on org A and switches context to org B before the PUT
// resolves would otherwise see A's result painted into B's cache — B
// showing a default it doesn't have, A never showing the write it made.
export interface OrgDefaultMutationTarget {
  name: string | null;
  org: string | null;
}

export function orgDefaultMutationOptions(qc: QueryClient) {
  return {
    mutationFn: ({ name, org }: OrgDefaultMutationTarget) =>
      languagesApi.setOrgDefaultLanguage(name, undefined, org),
    onSuccess: (data: OrgDefaultLanguage, { org }: OrgDefaultMutationTarget) =>
      applyOrgDefaultToCache(qc, org, data),
  };
}

export function useSetOrgDefaultLanguage() {
  return useMutation(orgDefaultMutationOptions(useQueryClient()));
}

// Cache effects of the two mutations that can move the org default, split
// out of the hooks so they're unit-testable against a real QueryClient
// (same convention as the mode-list helpers in use-prompt-config.ts).
// `org` is the normalized key, never a raw prop.

export function applyOrgDefaultToCache(
  qc: QueryClient,
  org: string | null,
  data: OrgDefaultLanguage
): void {
  // Paint first…
  qc.setQueryData(keys.orgDefault(org), data);
  // …then reconcile. The optimistic value can be a GUESS: worker#236 pins
  // the request shape but not the response envelope, so an unrecognized
  // 2xx body makes `setOrgDefaultLanguage` fall back to the slug we asked
  // for. Without this invalidation that guess would stand until the next
  // page load.
  void qc.invalidateQueries({ queryKey: keys.orgDefault(org) });
  // The notice reads `published` off the collection, so refresh it too — a
  // default set on a row published in another tab would otherwise keep
  // warning "still a draft".
  void qc.invalidateQueries({ queryKey: keys.languages(org) });
}

export function applyLanguageDeletionToCache(
  qc: QueryClient,
  org: string | null
): void {
  void qc.invalidateQueries({ queryKey: keys.languages(org) });
  // #286 — a delete that SUCCEEDS proves this language was not the org
  // default (upstream 409s otherwise). That makes a cached default naming
  // it provably stale: another admin cleared or repointed the default
  // since our last read, and keeping our copy would render the drift
  // warning as a pure cache artifact against a language we just deleted.
  void qc.invalidateQueries({ queryKey: keys.orgDefault(org) });
}

// Exported for unit tests (tests/use-languages-cache.test.ts) so the
// key-collision rule above is asserted, not just commented.
export const languageQueryKeys = keys;
