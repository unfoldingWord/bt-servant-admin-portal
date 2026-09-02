import { afterEach, describe, expect, it, vi } from "vitest";

import { getShareConfig } from "../src/lib/share-config-api";

// #311 — client for GET /api/share-config. Pins the feature-detection
// contract (404/501 → unsupported, everything else non-OK → throw) and the
// defensive parse of the body.

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })
  );
  return spy;
}

describe("getShareConfig", () => {
  it("sends the same-origin header to the BFF route", async () => {
    const spy = mockFetch(200, { whatsapp_number: null, whatsapp_org: null });
    await getShareConfig();
    expect(String(spy.mock.calls[0]![0])).toBe("/api/share-config");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("returns the config on 200", async () => {
    mockFetch(200, {
      whatsapp_number: "+57 300 123 4567",
      whatsapp_org: "unfoldingWord",
    });
    expect(await getShareConfig()).toEqual({
      supported: true,
      config: {
        whatsappNumber: "+57 300 123 4567",
        whatsappOrg: "unfoldingWord",
      },
    });
  });

  it("treats 404 and 501 as an older BFF without the route", async () => {
    mockFetch(404, { error: "Not found" });
    expect(await getShareConfig()).toEqual({ supported: false });
    mockFetch(501, "");
    expect(await getShareConfig()).toEqual({ supported: false });
  });

  it("throws on other failures so the panel shows an error, not 'unconfigured'", async () => {
    mockFetch(401, { error: "Unauthorized" });
    await expect(getShareConfig()).rejects.toThrow(/401/);
    mockFetch(500, "boom");
    await expect(getShareConfig()).rejects.toThrow(/500.*boom/);
  });

  it("drops non-string and blank values to null", async () => {
    mockFetch(200, { whatsapp_number: 5730012, whatsapp_org: "   " });
    expect(await getShareConfig()).toEqual({
      supported: true,
      config: { whatsappNumber: null, whatsappOrg: null },
    });
    mockFetch(200, {});
    expect(await getShareConfig()).toEqual({
      supported: true,
      config: { whatsappNumber: null, whatsappOrg: null },
    });
  });
});
