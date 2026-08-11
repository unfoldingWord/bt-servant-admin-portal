import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  applyLanguageDeletionToCache,
  applyOrgDefaultToCache,
  languageQueryKeys,
} from "../src/hooks/use-languages";
import type { OrgDefaultLanguage, OrgLanguages } from "../src/types/language";

// #286 — the cache effects of the two mutations that can move the org
// default. Both were originally invalidating only the languages
// collection, which left two provable stale paths (below).

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function seed(qc: QueryClient, org: string | null): void {
  qc.setQueryData<OrgLanguages>(languageQueryKeys.languages(org), {
    languages: [{ name: "hindi", document: "", published: true }],
  });
  qc.setQueryData<OrgDefaultLanguage>(languageQueryKeys.orgDefault(org), {
    supported: true,
    name: "hindi",
  });
}

function invalidatedKeys(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.map(
    (call) => (call[0] as { queryKey: unknown[] }).queryKey
  );
}

describe("query keys", () => {
  it("the org-default key cannot collide with a language named 'default'", () => {
    // `default` is a legal language slug — the same collision worker#236
    // avoided by naming the route `languages-default`. A key of
    // ["languages", "default", org] would make the per-language cache
    // entry and the org-default entry the same cache slot.
    expect(languageQueryKeys.orgDefault(null)).not.toEqual(
      languageQueryKeys.language("default", null)
    );
    expect(languageQueryKeys.orgDefault(null)[0]).not.toBe(
      languageQueryKeys.languages(null)[0]
    );
  });

  it("keys are org-scoped so a cross-org view can't read the home org's default", () => {
    expect(languageQueryKeys.orgDefault("word-collective")).not.toEqual(
      languageQueryKeys.orgDefault(null)
    );
  });
});

describe("applyOrgDefaultToCache", () => {
  it("paints the new value immediately (no round-trip of dead UI)", () => {
    const qc = makeClient();
    seed(qc, null);
    applyOrgDefaultToCache(qc, null, { supported: true, name: "swahili" });
    expect(qc.getQueryData(languageQueryKeys.orgDefault(null))).toEqual({
      supported: true,
      name: "swahili",
    });
  });

  it("invalidates the org default AFTER painting, so an echo guess self-corrects", () => {
    // setOrgDefaultLanguage falls back to the requested slug when the 2xx
    // body isn't recognizable (worker#236 doesn't pin the envelope). That
    // optimistic value must be reconciled against the server rather than
    // trusted until the next page load.
    const qc = makeClient();
    seed(qc, null);
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyOrgDefaultToCache(qc, null, { supported: true, name: "swahili" });
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.orgDefault(null)
    );
  });

  it("also invalidates the collection the published-state notice reads", () => {
    const qc = makeClient();
    seed(qc, null);
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyOrgDefaultToCache(qc, null, { supported: true, name: "swahili" });
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.languages(null)
    );
  });

  it("scopes both invalidations to the org being viewed", () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyOrgDefaultToCache(qc, "word-collective", {
      supported: true,
      name: "hindi",
    });
    for (const key of invalidatedKeys(spy)) {
      expect(key).toContain("word-collective");
    }
  });

  it("clearing writes null through rather than dropping the entry", () => {
    const qc = makeClient();
    seed(qc, null);
    applyOrgDefaultToCache(qc, null, { supported: true, name: null });
    expect(qc.getQueryData(languageQueryKeys.orgDefault(null))).toEqual({
      supported: true,
      name: null,
    });
  });
});

describe("applyLanguageDeletionToCache", () => {
  it("invalidates the cached org default, not just the collection", () => {
    // Stale path: admin B clears the default; admin A's cache still names
    // "hindi". A's delete of "hindi" then succeeds upstream (no 409,
    // because it is no longer the default) — and with only the collection
    // refreshed, A's page renders the drift warning about a language A
    // just deleted, as a pure cache artifact.
    const qc = makeClient();
    seed(qc, null);
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyLanguageDeletionToCache(qc, null);
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.orgDefault(null)
    );
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.languages(null)
    );
  });

  it("scopes the invalidation to the org being viewed", () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyLanguageDeletionToCache(qc, "word-collective");
    for (const key of invalidatedKeys(spy)) {
      expect(key).toContain("word-collective");
    }
  });
});
