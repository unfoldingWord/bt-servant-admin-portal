import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyLanguageDeletionToCache,
  applyOrgDefaultToCache,
  languageDeleteMutationOptions,
  languageQueryKeys,
  languageSaveMutationOptions,
  orgDefaultMutationOptions,
} from "../src/hooks/use-languages";
import type { OrgDefaultLanguage, OrgLanguages } from "../src/types/language";

afterEach(() => {
  vi.restoreAllMocks();
});

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

// The org-context switch race: a super admin hits Set on org A and picks
// org B from the context selector before the PUT resolves. TanStack hands
// a settled mutation the LATEST options closure, so a hook that read an
// ambient org key would apply A's outcome to B. These tests drive the
// exact options objects the hooks use and assert both the request target
// and the cache write follow the mutate-time variables instead.

describe("orgDefaultMutationOptions — org travels in the variables", () => {
  it("sends the PUT to the org named at mutate time", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "hindi" })));
    const opts = orgDefaultMutationOptions(makeClient());
    await opts.mutationFn({ name: "hindi", org: "alpha" });
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/languages-default?org=alpha"
    );
  });

  it("writes the result to the mutate-time org, even after the view moved on", async () => {
    const qc = makeClient();
    seed(qc, "alpha");
    seed(qc, "beta");
    const opts = orgDefaultMutationOptions(qc);
    // The user is now looking at beta; this settled request was made
    // against alpha.
    opts.onSuccess(
      { supported: true, name: "swahili" },
      {
        name: "swahili",
        org: "alpha",
      }
    );
    expect(qc.getQueryData(languageQueryKeys.orgDefault("alpha"))).toEqual({
      supported: true,
      name: "swahili",
    });
    expect(qc.getQueryData(languageQueryKeys.orgDefault("beta"))).toEqual({
      supported: true,
      name: "hindi",
    });
  });

  it("same-org (null key) writes are unaffected by the pinning", async () => {
    const qc = makeClient();
    seed(qc, null);
    const opts = orgDefaultMutationOptions(qc);
    opts.onSuccess({ supported: true, name: null }, { name: null, org: null });
    expect(qc.getQueryData(languageQueryKeys.orgDefault(null))).toEqual({
      supported: true,
      name: null,
    });
  });
});

describe("languageSaveMutationOptions — org travels in the variables", () => {
  it("sends the PUT to the org named at mutate time", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ language: { name: "hindi" } }))
      );
    const opts = languageSaveMutationOptions(makeClient());
    await opts.mutationFn({
      name: "hindi",
      body: { document: "x" },
      org: "alpha",
    });
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/languages/hindi?org=alpha"
    );
  });

  it("invalidates the mutate-time org after the ambient key moved on", () => {
    // Reachable, not theoretical: the org-context dialog offers "Discard
    // and switch" WHILE a save is in flight. With a closure-read key, org
    // A's completed save would refresh org B and leave A's cache holding
    // the pre-save document — a save that looks lost, and a stale base for
    // the next edit to overwrite it from.
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    languageSaveMutationOptions(qc).onSuccess(undefined, {
      name: "hindi",
      body: { document: "x" },
      org: "alpha",
    });
    for (const key of invalidatedKeys(spy)) {
      expect(key).toContain("alpha");
    }
  });

  it("refreshes both the collection and the saved row's own entry", () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    languageSaveMutationOptions(qc).onSuccess(undefined, {
      name: "hindi",
      body: { document: "x" },
      org: null,
    });
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.languages(null)
    );
    expect(invalidatedKeys(spy)).toContainEqual(
      languageQueryKeys.language("hindi", null)
    );
  });
});

describe("languageDeleteMutationOptions — org travels in the variables", () => {
  it("sends the DELETE to the org named at mutate time", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const opts = languageDeleteMutationOptions(makeClient());
    await opts.mutationFn({ name: "hindi", org: "alpha" });
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/languages/hindi?org=alpha"
    );
  });

  it("invalidates the mutate-time org, not whichever org is on screen", () => {
    const qc = makeClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    languageDeleteMutationOptions(qc).onSuccess(undefined, {
      name: "hindi",
      org: "alpha",
    });
    for (const key of invalidatedKeys(spy)) {
      expect(key).toContain("alpha");
    }
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
