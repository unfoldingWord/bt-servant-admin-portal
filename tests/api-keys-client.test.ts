import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiKeysRequestError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "../src/lib/api-keys-api";
import { keyState, lastUsedLabel, sortKeys } from "../src/lib/api-key-display";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status }))
    );
}

function sent(spy: ReturnType<typeof mockFetch>, n = 0) {
  const [url, init] = spy.mock.calls[n]!;
  return { url: String(url), init: init! };
}

describe("api-keys-api (#354)", () => {
  it("lists the caller's own org with no org param", async () => {
    const spy = mockFetch(200, { keys: [] });
    await listApiKeys(null, false);
    const { url, init } = sent(spy);
    expect(url).toBe("/api/config/api-keys");
    expect(new Headers(init.headers).get("X-Requested-With")).toBe(
      "XMLHttpRequest"
    );
  });

  it("builds ?org= and ?scope=all for a super admin", async () => {
    const spy = mockFetch(200, { keys: [] });
    await listApiKeys("bcs", false);
    await listApiKeys("bcs", true);
    await listApiKeys(null, true);
    expect(sent(spy, 0).url).toBe("/api/config/api-keys?org=bcs");
    expect(sent(spy, 1).url).toBe("/api/config/api-keys?org=bcs&scope=all");
    expect(sent(spy, 2).url).toBe("/api/config/api-keys?scope=all");
  });

  it("create sends only name, app and the terms acceptance", async () => {
    const spy = mockFetch(201, { key: {}, apiKey: "bts_x" });
    const out = await createApiKey(null, {
      name: "Prod",
      app: "App",
      acceptTerms: "v1",
    });
    expect(out.apiKey).toBe("bts_x");
    const { url, init } = sent(spy);
    expect(url).toBe("/api/config/api-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Prod",
      app: "App",
      acceptTerms: "v1",
    });
  });

  it("revoke and rotate address the key by id", async () => {
    const spy = mockFetch(200, { key: {}, apiKey: "bts_new" });
    await revokeApiKey("pk_0123456789abcdef");
    const rotated = await rotateApiKey("pk_0123456789abcdef", 0);
    expect(sent(spy, 0).url).toBe(
      "/api/config/api-keys/pk_0123456789abcdef/revoke"
    );
    expect(sent(spy, 1).url).toBe(
      "/api/config/api-keys/pk_0123456789abcdef/rotate"
    );
    expect(JSON.parse(String(sent(spy, 1).init.body))).toEqual({
      graceSeconds: 0,
    });
    expect(rotated.apiKey).toBe("bts_new");
  });

  it("a null or non-JSON error body still yields an ApiKeysRequestError", async () => {
    mockFetch(500, null);
    const err = await listApiKeys(null, false).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiKeysRequestError);
    expect(err).toMatchObject({ status: 500, message: "Request failed (500)" });
  });

  it("errors carry the status, message and code", async () => {
    mockFetch(409, { error: "Accept the terms", code: "terms_not_accepted" });
    const err = await createApiKey(null, { name: "a", app: "b" }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ApiKeysRequestError);
    expect(err).toMatchObject({
      status: 409,
      code: "terms_not_accepted",
      message: "Accept the terms",
    });
  });
});

describe("api-key-display (#354)", () => {
  it("last used falls back when absent or unparseable", () => {
    expect(lastUsedLabel({})).toBe("Not yet recorded");
    expect(lastUsedLabel({ lastUsedAt: "garbage" })).toBe("Not yet recorded");
    expect(lastUsedLabel({ lastUsedAt: "2026-11-13T10:00:00Z" })).toMatch(
      /2026/
    );
  });

  it("status: active, ending (rotation grace), revoked, expired", () => {
    expect(keyState({ status: "active" })).toEqual({
      label: "Active",
      tone: "active",
    });
    expect(
      keyState({ status: "active", expiresAt: "2026-11-20T00:00:00Z" }).tone
    ).toBe("grace");
    expect(keyState({ status: "revoked" }).label).toBe("Revoked");
    expect(keyState({ status: "expired" }).label).toBe("Expired");
  });

  it("sorts active keys first, newest first", () => {
    const sorted = sortKeys([
      {
        id: "old",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "dead",
        status: "revoked" as const,
        createdAt: "2026-12-01T00:00:00Z",
      },
      {
        id: "new",
        status: "active" as const,
        createdAt: "2026-06-01T00:00:00Z",
      },
    ]);
    expect(sorted.map((k) => k.id)).toEqual(["new", "old", "dead"]);
  });
});
