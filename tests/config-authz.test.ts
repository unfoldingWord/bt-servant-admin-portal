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
