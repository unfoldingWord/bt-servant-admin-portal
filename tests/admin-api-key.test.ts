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
  ENGINE_KEY_MISSING_MESSAGE,
  engineFetch,
  engineRoute,
  resolveEngineKey,
} from "../worker/helpers";
import type { SessionData } from "../worker/types";

// Every BFF call to the engine uses ADMIN_API_KEY when it is set and falls
// back to ENGINE_API_KEY when it is not.

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  // The resolver warns once per isolate; silence it here and assert on the
  // warning through a fresh module import.
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

describe("resolveEngineKey", () => {
  it("uses ADMIN_API_KEY when it is set", () => {
    expect(
      resolveEngineKey({ ADMIN_API_KEY: "admin", ENGINE_API_KEY: "engine" })
    ).toEqual({ key: "admin", source: "ADMIN_API_KEY" });
  });

  it("returns the trimmed key when ADMIN_API_KEY is padded", () => {
    expect(
      resolveEngineKey({ ADMIN_API_KEY: "  admin\n", ENGINE_API_KEY: "engine" })
        .key
    ).toBe("admin");
  });

  it("falls back to ENGINE_API_KEY, untrimmed, when ADMIN_API_KEY is unset", () => {
    expect(resolveEngineKey({ ENGINE_API_KEY: " engine" })).toEqual({
      key: " engine",
      source: "ENGINE_API_KEY",
    });
  });

  it("falls back to ENGINE_API_KEY when ADMIN_API_KEY is blank", () => {
    expect(
      resolveEngineKey({ ADMIN_API_KEY: "", ENGINE_API_KEY: "engine" }).key
    ).toBe("engine");
    expect(
      resolveEngineKey({ ADMIN_API_KEY: "  \n", ENGINE_API_KEY: "engine" }).key
    ).toBe("engine");
  });

  it("warns once per isolate on fallback, naming the source but not the key", async () => {
    vi.resetModules();
    const fresh = await import("../worker/helpers");
    fresh.resolveEngineKey({ ENGINE_API_KEY: "engine-secret-value" });
    fresh.resolveEngineKey({ ENGINE_API_KEY: "engine-secret-value" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = String(warnSpy.mock.calls[0]![0]);
    expect(JSON.parse(logged)).toEqual({
      event: "engine_admin_key_fallback",
      key_source: "ENGINE_API_KEY",
      reason: "unset",
    });
    expect(logged).not.toContain("engine-secret-value");
  });

  it("does not warn when ADMIN_API_KEY is set", async () => {
    vi.resetModules();
    const fresh = await import("../worker/helpers");
    fresh.resolveEngineKey({
      ADMIN_API_KEY: "admin",
      ENGINE_API_KEY: "engine",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("engineRoute", () => {
  it("replaces ids, org names and slugs with placeholders and drops the query", () => {
    expect(
      engineRoute("/api/v1/admin/orgs/acme/users/1234-abcd/memory?x=1")
    ).toBe("/api/v1/admin/orgs/:org/users/:userId/memory");
    expect(engineRoute("/api/v1/admin/orgs/acme/mcp-servers")).toBe(
      "/api/v1/admin/orgs/:org/mcp-servers"
    );
    expect(engineRoute("/api/v1/admin/orgs/acme/languages")).toBe(
      "/api/v1/admin/orgs/:org/languages"
    );
    expect(engineRoute("/api/v1/chat/stream")).toBe("/api/v1/chat/stream");
  });

  it("templates group, thread and DO ids", () => {
    expect(
      engineRoute("/api/v1/admin/orgs/acme/groups/c-1/threads/t-2/history")
    ).toBe("/api/v1/admin/orgs/:org/groups/:chatId/threads/:threadId/history");
    expect(engineRoute("/api/v1/admin/do/abc123/snapshot")).toBe(
      "/api/v1/admin/do/:hexId/snapshot"
    );
  });

  it("is not shifted by a mode named like a collection", () => {
    expect(engineRoute("/api/v1/admin/orgs/acme/modes/languages/_rename")).toBe(
      "/api/v1/admin/orgs/:org/modes/:mode/_rename"
    );
  });

  it("is not shifted by an org named like a collection", () => {
    expect(engineRoute("/api/v1/admin/orgs/users/users/u-1/history")).toBe(
      "/api/v1/admin/orgs/:org/users/:userId/history"
    );
    expect(engineRoute("/api/v1/orgs/users/modes")).toBe(
      "/api/v1/orgs/:org/modes"
    );
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

  function authErrorLogs(error: MockInstance<typeof console.error>) {
    return error.mock.calls
      .map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
      .filter((e) => e.event === "engine_auth_error");
  }

  it.each([401, 403])(
    "logs a neutral engine_auth_error on %i and returns the same response",
    async (status) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const engineRes = new Response('{"error":"nope"}', { status });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(engineRes);
      const res = await engineFetch(
        withAdminKey(),
        "/api/v1/admin/orgs/acme/users/u-123/memory?x=1",
        { method: "DELETE" }
      );
      expect(res).toBe(engineRes);
      expect(authErrorLogs(error)).toEqual([
        {
          event: "engine_auth_error",
          key_source: "ADMIN_API_KEY",
          status,
          method: "DELETE",
          route: "/api/v1/admin/orgs/:org/users/:userId/memory",
        },
      ]);
      expect(JSON.stringify(error.mock.calls)).not.toContain(ADMIN_KEY);
      expect(JSON.stringify(error.mock.calls)).not.toContain("u-123");
    }
  );

  it("names the fallback key source", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 401 })
    );
    await engineFetch(env, "/api/v1/chat/stream", { method: "POST" });
    expect(authErrorLogs(error)[0]).toMatchObject({
      key_source: "ENGINE_API_KEY",
      status: 401,
      route: "/api/v1/chat/stream",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(env.ENGINE_API_KEY);
  });

  it("returns a 403 at once, untouched, even when its body never closes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // One chunk, then the stream stays open forever.
        controller.enqueue(encoder.encode('{"error":'));
      },
    });
    const engineRes = new Response(body, { status: 403 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(engineRes);
    const res = await engineFetch(withAdminKey(), "/api/v1/admin/orgs/acme");
    expect(res).toBe(engineRes);
    expect(res.bodyUsed).toBe(false);
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('{"error":');
    await reader.cancel();
  });

  it.each([
    ["empty", ""],
    ["blank", "  "],
    ["unset", undefined],
  ])(
    "returns a 500 config error without calling the engine when no key is set (%s)",
    async (_label, engineKey) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const spy = mockFetch();
      const res = await engineFetch(
        { ...env, ENGINE_API_KEY: engineKey as unknown as string },
        "/api/v1/admin/orgs/acme/modes",
        { method: "PUT" }
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: ENGINE_KEY_MISSING_MESSAGE });
      expect(spy).not.toHaveBeenCalled();
      const logs = error.mock.calls.map(
        (c) => JSON.parse(String(c[0])) as Record<string, unknown>
      );
      expect(logs).toContainEqual({
        event: "engine_key_missing",
        method: "PUT",
        route: "/api/v1/admin/orgs/:org/modes",
      });
    }
  );

  it("does not log other statuses", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 500 })
    );
    await engineFetch(env, "/api/v1/admin/orgs/acme");
    expect(authErrorLogs(error)).toEqual([]);
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

  function erroredBody(status: number) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream broke"));
      },
    });
    return new Response(body, { status });
  }

  it("fetchResourceState keeps its status mapping when the error body is an errored stream", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(erroredBody(404))
      .mockResolvedValueOnce(erroredBody(500));
    await expect(
      __testInternals.fetchResourceState(withAdminKey(), "mode", "acme", "m1")
    ).resolves.toEqual({ status: "missing" });
    await expect(
      __testInternals.fetchResourceState(withAdminKey(), "mode", "acme", "m1")
    ).resolves.toEqual({ status: "error" });
  });

  it("fetchMcpServerOwners throws its own error when the error body is an errored stream", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(erroredBody(500));
    await expect(
      __testInternals.fetchMcpServerOwners(withAdminKey(), "acme")
    ).rejects.toThrow("MCP pool read failed (500)");
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
