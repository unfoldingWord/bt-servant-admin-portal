import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleConfig } from "../worker/config";
import type { SessionData } from "../worker/types";

// #286 — BFF proxy for the org default language pair (contract:
// worker#236). The route does not exist upstream yet, so every test here
// mocks the engine; what's pinned is the PORTAL's behavior: who may write,
// which org the request is scoped to, and that nothing leaks upstream when
// the gate fires.

afterEach(() => {
  vi.restoreAllMocks();
});

const PATH = "/api/config/languages-default";

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: crypto.randomUUID(),
    email: "alice@acme.com",
    name: "Alice",
    org: "acme",
    isAdmin: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function spyFetch(status = 200, body: unknown = { name: null }) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status }))
    );
}

function get(query = ""): Request {
  return new Request(`https://portal.example.test${PATH}${query}`);
}

function put(name: string | null, query = ""): Request {
  return new Request(`https://portal.example.test${PATH}${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe("#286 languages-default — GET is open to any session", () => {
  it("non-admin GET → proxies to the org's languages-default", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(get(), env, makeSession(), PATH);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://engine.example.test/api/v1/admin/orgs/acme/languages-default"
    );
  });

  it("reads pass the shared admin token upstream (trusted-portal model)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(get(), env, makeSession(), PATH);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-engine-key"
    );
  });

  it("passes an upstream 404 through unchanged (route not deployed yet)", async () => {
    // The graceful-absence path in src/lib/languages-api.ts keys on this
    // status, so the BFF must not rewrite it into a 500 or an empty 200.
    spyFetch(404, { error: "Not found" });
    const res = await handleConfig(get(), env, makeSession(), PATH);
    expect(res.status).toBe(404);
  });
});

describe("#286 languages-default — PUT is admin-only", () => {
  it("non-admin PUT → 403 and nothing reaches upstream", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(put("hindi"), env, makeSession(), PATH);
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a language shepherd with FULL per-row rights still cannot set the default", async () => {
    // The org default is one pointer shared by every end user in the org.
    // Per-row rights scope shepherds to rows; letting edit+publish on
    // "hindi" redirect the whole org's tuning (or demote another
    // shepherd's language) would be an org-wide write bought with a
    // per-row grant.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi"),
      env,
      makeSession({
        language_edit_rights: "*",
        language_publish_rights: "*",
        language_rights: "*",
      }),
      PATH
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("admin PUT → proxies with the body intact", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ name: "hindi" });
  });

  it("admin PUT { name: null } clears the default (null survives the proxy)", async () => {
    // JSON.stringify round-tripping through proxyToEngine must not drop or
    // coerce the null — it is the clear signal in the worker#236 contract.
    const fetchSpy = spyFetch();
    await handleConfig(put(null), env, makeSession({ isAdmin: true }), PATH);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ name: null });
  });

  it("super admin without isAdmin may write (super trumps isAdmin)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      PATH
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("malformed PUT body from an admin → 400, no upstream call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${PATH}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      }),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DELETE is not part of the pair → rejected without an upstream call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${PATH}`, { method: "DELETE" }),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes an upstream 409 through (default must reference a real entry)", async () => {
    spyFetch(409, { error: "unknown language" });
    const res = await handleConfig(
      put("nope"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(409);
  });
});

describe("#286 languages-default — org scoping (#247 exact match)", () => {
  it("?org=<own org> resolves as same-org for an org admin", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi", "?org=acme"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages-default"
    );
  });

  it("?org=<other org> from a non-super-admin → 403, nothing proxied", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi", "?org=word-collective"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org=<other org> from a super admin → proxied to THAT org", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi", "?org=word-collective"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      PATH
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/languages-default"
    );
  });

  it("a case-variant of the caller's org is a DIFFERENT org, not a same-org alias", async () => {
    // Exact-match compare per #247 / the KV key rule: "ACME" is either a
    // genuinely distinct org or a probe, and both must stay loud instead
    // of silently retargeting to session.org.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      put("hindi", "?org=ACME"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("GET is org-scoped too — cross-org read needs isSuperAdmin", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      get("?org=word-collective"),
      env,
      makeSession({ isAdmin: true }),
      PATH
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an org needing URL encoding is encoded exactly once", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      get("?org=word%20collective"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      PATH
    );
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://engine.example.test/api/v1/admin/orgs/word%20collective/languages-default"
    );
  });

  it("a path-shaped org is rejected before any upstream call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      get("?org=.."),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      PATH
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("#286 languages-default — route does not shadow a language named 'default'", () => {
  it("/api/config/languages/default still addresses the LANGUAGE", async () => {
    // The whole reason the contract uses `languages-default` instead of
    // `languages/default`: "default" is a legal language slug.
    const fetchSpy = spyFetch();
    await handleConfig(
      new Request("https://portal.example.test/api/config/languages/default"),
      env,
      makeSession(),
      "/api/config/languages/default"
    );
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "https://engine.example.test/api/v1/admin/orgs/acme/languages/default"
    );
  });
});
