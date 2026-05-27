import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleConfig } from "../worker/config";
import type { SessionData } from "../worker/types";

afterEach(() => {
  vi.restoreAllMocks();
});

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

function makeRequest(method: string, pathname: string): Request {
  return new Request(`https://portal.example.test${pathname}`, { method });
}

// When the gate fires, the worker must NOT touch the upstream engine — that
// would leak the request through despite the 403. We assert this by spying on
// fetch and verifying it was never called.
function spyFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 200 }));
}

describe("config authz — /api/config/modes/{name}", () => {
  it("non-admin PUT → 403 (and worker does not proxy upstream)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin DELETE → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin GET → proxies to engine (read is open)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken"
    );
  });

  it("admin PUT → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("admin DELETE → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});

describe("config authz — /api/config/prompt-overrides", () => {
  it("non-admin PUT → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin DELETE → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin GET → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("admin PUT → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      new Request("https://portal.example.test/api/config/prompt-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "hi" }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("config authz — /api/config/modes (list)", () => {
  it("non-admin GET → proxies to engine (list is open)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes"
    );
  });
});

// ---------------------------------------------------------------------------
// Super-admin parity (#138)
// ---------------------------------------------------------------------------
//
// "super trumps isAdmin" is the principle in worker/admin.ts. It must apply
// uniformly across the worker — without these tests, a super-admin who
// self-demotes isAdmin (allowed) gets a weird partial-power state: they can
// manage users but can't edit modes/prompt-overrides. Pin the parity here
// so the next person touching isAdminMutation doesn't accidentally regress
// the isSuperAdmin branch.

describe("config authz — super admin trumps isAdmin", () => {
  it("super admin without isAdmin can PUT /api/config/modes/{name}", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("super admin without isAdmin can DELETE /api/config/modes/{name}", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("super admin without isAdmin can PUT /api/config/prompt-overrides", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      new Request("https://portal.example.test/api/config/prompt-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "hi" }),
      }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("admin with isSuperAdmin: true also still works (mixed-role regression)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: true, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("neither isAdmin nor isSuperAdmin → 403 (regression on baseline)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cross-org override via ?org= (#166)
// ---------------------------------------------------------------------------
//
// Super admins need to edit modes/languages/prompt-overrides in orgs they
// don't sit in (Tim's 2026-05-21 Zoom — Elsy as super-admin couldn't see
// Word Collective from her uW session). Closing the gap with an explicit
// `?org=<slug>` query param: super-admin only, loud 403 for non-super,
// 400 on empty/path-traversal shapes. No behavior change when the param
// is absent — that's the everyday org-admin path.

function makeRequestWithQuery(
  method: string,
  pathname: string,
  query: string,
  init?: RequestInit
): Request {
  return new Request(`https://portal.example.test${pathname}?${query}`, {
    method,
    ...init,
  });
}

describe("config authz — cross-org via ?org= (#166)", () => {
  it("non-super-admin with ?org=other → 403 (loud reject, not silent fallback)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/modes/spoken", "org=other", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: true, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("plain user (non-admin) with ?org=other → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes/spoken", "org=other"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org=  (whitespace-only) → 400", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=%20%20"),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org= (empty) → 400", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org="),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org=foo/bar (path-traversal shape) → 400 even for super-admin", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=foo%2Fbar"),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no ?org= + super-admin → uses session.org (regression: same-org path unchanged)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes"
    );
  });

  it("super-admin PUT modes/{name} with ?org=other → proxies to /orgs/other/modes/...", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/modes/spoken",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "## Identity\n" }),
        }
      ),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken"
    );
  });

  it("super-admin GET modes list with ?org=other → proxies to /orgs/other/modes", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=word-collective"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes"
    );
  });

  it("super-admin PUT prompt-overrides with ?org=other → proxies to /orgs/other/prompt-overrides", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/prompt-overrides",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: "hi" }),
        }
      ),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/prompt-overrides"
    );
  });

  it("super-admin PUT languages/{name} with ?org=other bypasses language_rights", async () => {
    // language_rights are scoped to the user's home org; "english" in acme
    // and "english" in word-collective are distinct documents. Without the
    // cross-org bypass, a super-admin with restricted same-org shepherd
    // rights would inherit those restrictions when crossing orgs, which
    // makes no semantic sense and would block the workflow this PR exists
    // to enable.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/languages/english",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "# English\n" }),
        }
      ),
      env,
      makeSession({
        org: "acme",
        isSuperAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/languages/english"
    );
  });

  it("no ?org= + non-super with restricted language_rights → still 403 (same-org gate intact)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/languages/english"),
      env,
      makeSession({
        org: "acme",
        isAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin GET languages list with ?org=other → proxies to /orgs/other/languages", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/languages"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/languages"
    );
  });

  it("super-admin GET language-scaffold with ?org=other → proxies to /orgs/other/language-scaffold", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/language-scaffold",
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/language-scaffold"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/language-scaffold"
    );
  });

  it("super-admin PUT user-mode/{uuid} with ?org=other → proxies to /orgs/other/users/.../mode", async () => {
    const fetchSpy = spyFetch();
    const uuid = "00000000-0000-4000-8000-000000000001";
    await handleConfig(
      makeRequestWithQuery(
        "PUT",
        `/api/config/user-mode/${uuid}`,
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "spoken" }),
        }
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      `/api/config/user-mode/${uuid}`
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/word-collective/users/${uuid}/mode`
    );
  });

  it("super-admin GET user-memory/{uuid} with ?org=other → proxies to /orgs/other/users/.../memory", async () => {
    const fetchSpy = spyFetch();
    const uuid = "00000000-0000-4000-8000-000000000002";
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        `/api/config/user-memory/${uuid}`,
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      `/api/config/user-memory/${uuid}`
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/word-collective/users/${uuid}/memory`
    );
  });

  it("?org= trims whitespace and proxies the trimmed slug", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/modes",
        "org=%20word-collective%20"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes"
    );
  });
});
