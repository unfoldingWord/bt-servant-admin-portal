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

function makeRequest(
  method: string,
  pathAndQuery: string,
  body?: unknown
): Request {
  return new Request(`https://portal.example.test${pathAndQuery}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

// Fresh Response per call — bodies are one-shot streams. Each maker builds the
// response the arm gets on that fetch; the last maker repeats if fetch is
// called more times than makers provided.
function mockFetch(...makers: (() => Response)[]) {
  let i = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    // makers always has >= 1 element at call sites, so the clamped index is
    // in range; the assertion satisfies noUncheckedIndexedAccess.
    const maker = makers[Math.min(i, makers.length - 1)]!;
    i += 1;
    return Promise.resolve(maker());
  });
}

const ok = () => new Response("{}", { status: 200 });
const pool = (servers: { id: string; ownerOrg?: string }[]) =>
  new Response(JSON.stringify({ org: "acme", servers, migrated: true }), {
    status: 200,
  });

const MCP = "/api/config/mcp-servers";
const admin = () => makeSession({ isAdmin: true });
const superAdmin = () => makeSession({ isSuperAdmin: true });
const write = { id: "helps", name: "Helps", url: "https://x/mcp" };

describe("config — /api/config/mcp-servers (#292): read + add", () => {
  it("non-admin GET → 403 (management surface is admin-only)", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("GET", MCP),
      env,
      makeSession(),
      MCP
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("admin GET → proxies to the org's mcp-servers endpoint", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(makeRequest("GET", MCP), env, admin(), MCP);
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/mcp-servers"
    );
  });

  it("POST with no id → 400 before touching the engine", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("POST", MCP, { name: "x", url: "https://x/mcp" }),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST with a null JSON body → 400 (not an uncaught 500)", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("POST", MCP, null),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST add (new id, non-super) → reads the pool then proxies the write", async () => {
    const fetchSpy = mockFetch(() => pool([]), ok);
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(200);
    // fetch #1 = ownership read, fetch #2 = the proxied POST.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![1]).toMatchObject({ method: "POST" });
  });
});

describe("config — /api/config/mcp-servers (#292): owner-scoped edit", () => {
  it("editing your own server → allowed", async () => {
    const fetchSpy = mockFetch(
      () => pool([{ id: "helps", ownerOrg: "acme" }]),
      ok
    );
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("editing another org's server → 403, and the write is never sent", async () => {
    const fetchSpy = mockFetch(() =>
      pool([{ id: "helps", ownerOrg: "other" }])
    );
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(403);
    // Only the ownership read happened — no proxied write.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("editing an un-attributed (absent ownerOrg) server → 403 for a non-super", async () => {
    const fetchSpy = mockFetch(() => pool([{ id: "helps" }]));
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("super-admin skips the ownership read and writes directly", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      superAdmin(),
      MCP
    );
    expect(res.status).toBe(200);
    // No pool read — the only fetch is the proxied POST.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ method: "POST" });
  });

  it("fails closed: an ownership read that errors → 502, no write", async () => {
    const fetchSpy = mockFetch(() => new Response("nope", { status: 500 }));
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fails closed: a 200 owner read with no servers array → 502, no write", async () => {
    // A well-formed 200 that isn't the expected shape must not be read as an
    // empty pool (which would let an edit slip through as an add).
    const fetchSpy = mockFetch(
      () => new Response(JSON.stringify({ org: "acme" }), { status: 200 })
    );
    const res = await handleConfig(
      makeRequest("POST", MCP, write),
      env,
      admin(),
      MCP
    );
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards the trimmed id, so the verified key equals the written key", async () => {
    const fetchSpy = mockFetch(ok); // super-admin skips the ownership read
    await handleConfig(
      makeRequest("POST", MCP, { ...write, id: "helps " }),
      env,
      superAdmin(),
      MCP
    );
    const sent = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as {
      id: string;
    };
    expect(sent.id).toBe("helps");
  });
});

describe("config — /api/config/mcp-servers/{id} (#292): delete is super-only", () => {
  const DEL = `${MCP}/helps`;

  it("non-super DELETE → 403 before any engine call", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("DELETE", DEL),
      env,
      admin(),
      DEL
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin DELETE → proxies to the server's endpoint", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("DELETE", DEL),
      env,
      superAdmin(),
      DEL
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/mcp-servers/helps"
    );
    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ method: "DELETE" });
  });

  it("non-DELETE method on the id path (super) → 405", async () => {
    const fetchSpy = mockFetch(ok);
    const res = await handleConfig(
      makeRequest("GET", DEL),
      env,
      superAdmin(),
      DEL
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
