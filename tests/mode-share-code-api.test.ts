import { afterEach, describe, expect, it, vi } from "vitest";

import { getModeShareCode } from "../src/lib/mode-share-code-api";

// #345 — client for GET /api/config/modes/{name}/share-code. Pins that
// every HTTP outcome becomes a state the panel can name (none throws but a
// cancellation), and the defensive parse of the 200 body.

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })
  );
}

describe("getModeShareCode", () => {
  it("asks the BFF route, with the org param and the same-origin header", async () => {
    const spy = mockFetch(200, { capability: "unconfigured" });
    await getModeShareCode("obt-coach", "PBT");
    expect(String(spy.mock.calls[0]![0])).toBe(
      "/api/config/modes/obt-coach/share-code?org=PBT"
    );
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("parses each 200 body into the shared wire type", async () => {
    mockFetch(200, {
      capability: "present",
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "pbt",
      home_has_modes: false,
      home_org: "unfoldingWord",
    });
    expect(await getModeShareCode("obt-coach", "PBT")).toEqual({
      capability: "present",
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "pbt",
      home_has_modes: false,
      home_org: "unfoldingWord",
    });
    mockFetch(200, { capability: "absent", home: true });
    expect(await getModeShareCode("x", null)).toEqual({
      capability: "absent",
      home: true,
    });
    mockFetch(200, { capability: "unconfigured" });
    expect(await getModeShareCode("x", null)).toEqual({
      capability: "unconfigured",
    });
  });

  it("maps each status to its own state", async () => {
    const cases: [number, unknown][] = [
      [503, { error: "modes_unavailable", detail: "listing_lag" }],
      [404, { error: "mode_not_found" }],
      [401, { error: "Unauthorized" }],
      [403, { error: "Forbidden" }],
      [400, { error: "invalid_mode_name" }],
      [400, { error: "Invalid mode name" }],
      [400, { error: "Invalid org parameter" }],
      [400, { error: "Invalid org" }],
      [400, { error: "bad_request" }],
      [400, "not json"],
      [500, { error: "corrupt_modes_record" }],
      [502, { error: "Engine error" }],
      [500, "boom"],
    ];
    const got = [];
    for (const [status, body] of cases) {
      mockFetch(status, body);
      got.push(await getModeShareCode("x", null));
    }
    expect(got).toEqual([
      { capability: "unavailable" },
      { capability: "not-found" },
      { capability: "failed", failure: "signed-out" },
      { capability: "failed", failure: "forbidden" },
      { capability: "failed", failure: "invalid-name" },
      { capability: "failed", failure: "invalid-name" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "corrupt-record" },
      { capability: "failed", failure: "server" },
      { capability: "failed", failure: "server" },
    ]);
  });

  it("treats a malformed 200 as a server failure", async () => {
    for (const body of [
      "not json",
      { capability: "present", code: 7, resolves: true },
      { capability: "present", code: "x" },
      // A present answer without the BFF's home_org isn't one.
      { capability: "present", code: "x", resolves: true },
      { capability: "who-knows" },
    ]) {
      mockFetch(200, body);
      expect(await getModeShareCode("x", null)).toEqual({
        capability: "failed",
        failure: "server",
      });
    }
  });

  it("names a failed request as network, but lets a cancellation stay one", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );
    expect(await getModeShareCode("x", null)).toEqual({
      capability: "failed",
      failure: "network",
    });
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError")
    );
    await expect(
      getModeShareCode("x", null, controller.signal)
    ).rejects.toThrow();
  });
});
