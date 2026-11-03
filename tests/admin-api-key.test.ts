import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleDeleteMemory, handleHistory } from "../worker/chat";
import { handleConfig } from "../worker/config";
import { engineAdminKey } from "../worker/helpers";
import type { SessionData } from "../worker/types";

// Admin calls to the engine (/api/v1/admin/*) use ADMIN_API_KEY when it is
// set and fall back to ENGINE_API_KEY when it is not. Non-admin calls keep
// ENGINE_API_KEY either way.

afterEach(() => {
  vi.restoreAllMocks();
});

const ADMIN_KEY = "test-admin-key";

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
});

describe("BFF → engine admin calls", () => {
  const MCP = "/api/config/mcp-servers";

  it("send ENGINE_API_KEY when ADMIN_API_KEY is unset", async () => {
    const spy = mockFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${MCP}`),
      env,
      makeSession(),
      MCP
    );
    expect(res.status).toBe(200);
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/mcp-servers"
    );
    expect(authOf(spy)).toBe(`Bearer ${env.ENGINE_API_KEY}`);
  });

  it("send ADMIN_API_KEY when it is set (config proxy)", async () => {
    const spy = mockFetch();
    const res = await handleConfig(
      new Request(`https://portal.example.test${MCP}`),
      { ...env, ADMIN_API_KEY: ADMIN_KEY },
      makeSession(),
      MCP
    );
    expect(res.status).toBe(200);
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });

  it("send ADMIN_API_KEY when it is set (delete memory)", async () => {
    const spy = mockFetch({});
    const res = await handleDeleteMemory(
      new Request("https://portal.example.test/api/chat/memory", {
        method: "DELETE",
      }),
      { ...env, ADMIN_API_KEY: ADMIN_KEY },
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(String(spy.mock.calls[0]![0])).toContain("/api/v1/admin/orgs/acme/");
    expect(authOf(spy)).toBe(`Bearer ${ADMIN_KEY}`);
  });
});

describe("BFF → engine non-admin calls", () => {
  it("keep ENGINE_API_KEY even when ADMIN_API_KEY is set", async () => {
    const spy = mockFetch({ entries: [] });
    const res = await handleHistory(
      new Request("https://portal.example.test/api/chat/history"),
      { ...env, ADMIN_API_KEY: ADMIN_KEY },
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(String(spy.mock.calls[0]![0])).not.toContain("/api/v1/admin/");
    expect(authOf(spy)).toBe(`Bearer ${env.ENGINE_API_KEY}`);
  });
});
