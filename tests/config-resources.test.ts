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

function makeRequest(method: string, pathAndQuery: string): Request {
  return new Request(`https://portal.example.test${pathAndQuery}`, { method });
}

function spyFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );
}

describe("config — /api/config/resources (#230)", () => {
  it("non-admin GET → proxies to the aggregated engine endpoint (read is open)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("GET", "/api/config/resources?language=en"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/resources"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/resources?language=en"
    );
  });

  it("missing language → 400, and the worker does not touch the engine", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("GET", "/api/config/resources"),
      env,
      makeSession(),
      "/api/config/resources"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blank language → 400 (whitespace is not a language)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("GET", "/api/config/resources?language=%20%20"),
      env,
      makeSession(),
      "/api/config/resources"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("URL-encodes the language before composing the upstream path", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest(
        "GET",
        `/api/config/resources?language=${encodeURIComponent("es 419/x")}`
      ),
      env,
      makeSession(),
      "/api/config/resources"
    );
    const upstream = String(fetchSpy.mock.calls[0]![0]);
    expect(upstream).toContain("resources?language=es%20419%2Fx");
  });

  it("PUT → 405 (read-only route)", async () => {
    spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/resources?language=en"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/resources"
    );
    expect(res.status).toBe(405);
  });

  it("cross-org ?org= without super-admin → 403 before any engine call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("GET", "/api/config/resources?language=en&org=other-org"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/resources"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cross-org ?org= with super-admin → proxies against the requested org", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest(
        "GET",
        "/api/config/resources?language=sw&org=wordcollective"
      ),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/resources"
    );
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/wordcollective/resources?language=sw"
    );
  });
});
