import { afterEach, describe, expect, it, vi } from "vitest";

import { getResources } from "../src/lib/resources-api";
import type { AggregatedResourcesResponse } from "../src/types/resources";

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE: AggregatedResourcesResponse = {
  org: "acme",
  language: "en",
  resources: {
    bible: [
      { name: "en_ult", subject: "bible", serverId: "translation-helps" },
    ],
  },
  servers: [
    {
      serverId: "translation-helps",
      serverName: "Translation Helps",
      status: "ok",
    },
    { serverId: "fia", serverName: "FIA", status: "unsupported" },
  ],
};

function mockFetchOnce(
  status: number,
  body: unknown
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("getResources", () => {
  it("returns the aggregated response as-is (no envelope to unwrap)", async () => {
    mockFetchOnce(200, SAMPLE);
    const result = await getResources("en");
    expect(result).toEqual(SAMPLE);
  });

  it("sends the language as a query param, URL-encoded", async () => {
    const spy = mockFetchOnce(200, SAMPLE);
    await getResources("es-419");
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toBe("/api/config/resources?language=es-419");
  });

  it("appends ?org= for the super-admin cross-org path", async () => {
    const spy = mockFetchOnce(200, SAMPLE);
    await getResources("en", undefined, "wordcollective");
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/resources?language=en&org=wordcollective"
    );
  });

  it("drops blank/whitespace orgs instead of appending them", async () => {
    const spy = mockFetchOnce(200, SAMPLE);
    await getResources("en", undefined, "   ");
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/resources?language=en"
    );
  });

  it("sends the same-origin CSRF header", async () => {
    const spy = mockFetchOnce(200, SAMPLE);
    await getResources("en");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("throws with status and body text on non-2xx", async () => {
    mockFetchOnce(502, "upstream unavailable");
    await expect(getResources("en")).rejects.toThrow(
      /Failed to load resources \(502\): upstream unavailable/
    );
  });
});
