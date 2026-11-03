import { env } from "cloudflare:test";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

import {
  handleDeleteHistory,
  handleDeleteMemory,
  handleHistory,
  handleStream,
} from "../worker/chat";
import { __testInternals, handleConfig } from "../worker/config";
import {
  createEngineKeyResolver,
  engineAdminKey,
  engineFetch,
  ENGINE_KEY_REJECTED_MESSAGE,
} from "../worker/helpers";
import type { SessionData } from "../worker/types";

// Every BFF call to the engine uses ADMIN_API_KEY when it is set and falls
// back to ENGINE_API_KEY when it is not.

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  // The module-level resolver warns once per isolate; silence it here and
  // assert on the warning through a fresh createEngineKeyResolver().
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ADMIN_KEY = "test-admin-key";
const withAdminKey = () => ({ ...env, ADMIN_API_KEY: ADMIN_KEY });

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: crypto.randomUUID(),
    email: "alice@acme.com",
    name: "Alice",
    org: "acme",
    isAdmin: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetch(body: unknown = { servers: [] }) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    );
}

function urlOf(spy: ReturnType<typeof mockFetch>, call = 0): string {
  return String(spy.mock.calls[call]![0]);
}

function authOf(spy: ReturnType<typeof mockFetch>, call = 0): string | null {
  const init = spy.mock.calls[call]![1];
  return new Headers(init?.headers).get("Authorization");
}

describe("engineAdminKey", () => {
  it("uses ADMIN_API_KEY when it is set", () => {
    expect(
      engineAdminKey({ ADMIN_API_KEY: "admin", ENGINE_API_KEY: "engine" })
    ).toBe("admin");
  });

  it("returns the trimmed key when ADMIN_API_KEY is padded", () => {
    expect(
      engineAdminKey({ ADMIN_API_KEY: "  admin\n", ENGINE_API_KEY: "engine" })
    ).toBe("admin");
  });

  it("falls back to ENGINE_API_KEY when ADMIN_API_KEY is unset", () => {
    expect(engineAdminKey({ ENGINE_API_KEY: "engine" })).toBe("engine");
  });

  it("falls back to ENGINE_API_KEY when ADMIN_API_KEY is blank", () => {
    expect(
      engineAdminKey({ ADMIN_API_KEY: "", ENGINE_API_KEY: "engine" })
    ).toBe("engine");
    expect(
      engineAdminKey({ ADMIN_API_KEY: "  \n", ENGINE_API_KEY: "engine" })
    ).toBe("engine");
  });

  it("warns once per resolver on fallback, naming the source but not the key", () => {
    const warn = warnSpy;
    const resolve = createEngineKeyResolver();
    expect(resolve({ ENGINE_API_KEY: "engine-secret-value" }).source).toBe(
      "ENGINE_API_KEY"
    );
    resolve({ ENGINE_API_KEY: "engine-secret-value" });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]![0]);
    expect(JSON.parse(logged)).toEqual({
      event: "engine_admin_key_fallback",
      key_source: "ENGINE_API_KEY",
      reason: "unset",
    });
    expect(logged).not.toContain("engine-secret-value");
  });

  it("does not warn when ADMIN_API_KEY is set", () => {
    const warn = warnSpy;
    const resolve = createEngineKeyResolver();
    expect(
      resolve({ ADMIN_API_KEY: "admin", ENGINE_API_KEY: "engine" })
    ).toEqual({ key: "admin", source: "ADMIN_API_KEY" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("engineFetch", () => {
  it("sends the admin key on /api/v1/admin/* and keeps other headers", async () => {
    const spy = mockFetch();
    await engineFetch(withAdminKey(), "/api/v1/admin/orgs/acme/modes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });
    expect(urlOf(spy)).toBe(
      `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/acme/modes`
    );
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
    const init = spy.mock.calls[0]![1];
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("sends the admin key on non-admin paths too", async () => {
    const spy = mockFetch();
    await engineFetch(withAdminKey(), "/api/v1/chat/stream");
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("turns a 403 that requires the admin key into a 502 config error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "This route requires the admin API key" }),
        { status: 403 }
      )
    );
    const res = await engineFetch(
      withAdminKey(),
      "/api/v1/admin/orgs/acme/modes?x=1"
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: ENGINE_KEY_REJECTED_MESSAGE });
    const logged = String(error.mock.calls[0]![0]);
    expect(JSON.parse(logged)).toEqual({
      event: "engine_admin_key_rejected",
      key_source: "ADMIN_API_KEY",
      method: "GET",
      path: "/api/v1/admin/orgs/acme/modes",
    });
    expect(logged).not.toContain(ADMIN_KEY);
  });

  it("turns any 403 into a 502 config error while on the fallback", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
    const res = await engineFetch(env, "/api/v1/chat/stream", {
      method: "POST",
    });
    expect(res.status).toBe(502);
    expect(JSON.parse(String(error.mock.calls[0]![0])).key_source).toBe(
      "ENGINE_API_KEY"
    );
  });

  it("passes through an unrelated 403 when the admin key is in use", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Not your org" }), { status: 403 })
    );
    const res = await engineFetch(withAdminKey(), "/api/v1/admin/orgs/acme");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not your org" });
  });
});

describe("BFF → engine admin calls", () => {
  const MCP = "/api/config/mcp-servers";

  it("config proxy sends ENGINE_API_KEY when ADMIN_API_KEY is unset", async () => {
    const spy = mockFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${MCP}`),
      env,
      makeSession(),
      MCP
    );
    expect(res.status).toBe(200);
    expect(urlOf(spy)).toContain("/api/v1/admin/orgs/acme/mcp-servers");
    expect(authOf(spy)).toBe(`Bearer ${env.ENGINE_API_KEY}`);
  });

  it("config proxy sends ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${MCP}`),
      withAdminKey(),
      makeSession(),
      MCP
    );
    expect(res.status).toBe(200);
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("fetchResourceState sends ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({ org: "acme", mode: { name: "m1" } });
    await __testInternals.fetchResourceState(
      withAdminKey(),
      "mode",
      "acme",
      "m1"
    );
    expect(urlOf(spy)).toContain("/api/v1/admin/orgs/acme/modes/m1");
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("fetchMcpServerOwners sends ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({ servers: [{ id: "a", ownerOrg: "acme" }] });
    const owners = await __testInternals.fetchMcpServerOwners(
      withAdminKey(),
      "acme"
    );
    expect(owners.get("a")).toBe("acme");
    expect(urlOf(spy)).toContain("/api/v1/admin/orgs/acme/mcp-servers");
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("handleDeleteHistory sends ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({});
    const res = await handleDeleteHistory(
      new Request("https://portal.example.test/api/chat/history", {
        method: "DELETE",
      }),
      withAdminKey(),
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(urlOf(spy)).toMatch(
      /\/api\/v1\/admin\/orgs\/acme\/users\/.+\/history$/
    );
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("handleDeleteMemory sends ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({});
    const res = await handleDeleteMemory(
      new Request("https://portal.example.test/api/chat/memory", {
        method: "DELETE",
      }),
      withAdminKey(),
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(urlOf(spy)).toMatch(
      /\/api\/v1\/admin\/orgs\/acme\/users\/.+\/memory$/
    );
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });
});

describe("BFF → engine chat relay calls (admin client_id)", () => {
  it("history read uses ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({ entries: [] });
    const res = await handleHistory(
      new Request("https://portal.example.test/api/chat/history"),
      withAdminKey(),
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(urlOf(spy)).not.toContain("/api/v1/admin/");
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("chat stream uses ADMIN_API_KEY when it is set", async () => {
    const spy = mockFetch({});
    const res = await handleStream(
      new Request("https://portal.example.test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "hi" }),
        headers: { "Content-Type": "application/json" },
      }),
      withAdminKey(),
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(urlOf(spy)).toBe(`${env.ENGINE_BASE_URL}/api/v1/chat/stream`);
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });
});
