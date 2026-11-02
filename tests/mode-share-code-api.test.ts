import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getModeShareCode,
  ShareCodeRequestError,
} from "../src/lib/mode-share-code-api";

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

  it("returns each definite failure as an answer", async () => {
    const cases: [number, unknown][] = [
      [404, { error: "mode_not_found" }],
      [401, { error: "Unauthorized" }],
      [403, { error: "Forbidden" }],
      [400, { error: "invalid_mode_name" }],
      [400, { error: "Invalid mode name" }],
      [400, { error: "invalid_org", message: "too long for a KV key" }],
      [400, { error: "Invalid org parameter" }],
      [400, { error: "Invalid org" }],
      [400, { error: "bad_request" }],
      [400, "not json"],
      [500, { error: "corrupt_modes_record" }],
    ];
    const got = [];
    for (const [status, body] of cases) {
      mockFetch(status, body);
      got.push(await getModeShareCode("x", null));
    }
    expect(got).toEqual([
      { capability: "not-found" },
      { capability: "failed", failure: "signed-out" },
      { capability: "failed", failure: "forbidden" },
      { capability: "failed", failure: "invalid-name" },
      { capability: "failed", failure: "invalid-name" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "corrupt-record" },
    ]);
  });

  it("throws a typed error for each transient outcome, so a refetch keeps the last answer", async () => {
    const cases: [number, unknown, string][] = [
      [
        503,
        { error: "modes_unavailable", detail: "listing_lag" },
        "unavailable",
      ],
      [503, "Service Unavailable", "unavailable"],
      [502, { error: "Engine error" }, "server"],
      [500, "boom", "server"],
    ];
    for (const [status, body, kind] of cases) {
      mockFetch(status, body);
      const error = await getModeShareCode("x", null).catch((e: unknown) => e);
      expect(error, `${status}`).toBeInstanceOf(ShareCodeRequestError);
      expect((error as ShareCodeRequestError).kind).toBe(kind);
    }
  });

  it("throws a server error for a malformed 200", async () => {
    for (const body of [
      "not json",
      { capability: "present", code: 7, resolves: true },
      { capability: "present", code: "x" },
      // A present answer without the BFF's home_org isn't one.
      { capability: "present", code: "x", resolves: true },
      { capability: "who-knows" },
    ]) {
      mockFetch(200, body);
      await expect(getModeShareCode("x", null)).rejects.toMatchObject({
        kind: "server",
      });
    }
  });

  it("throws network for a failed request, but lets a cancellation stay one", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "network",
    });
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abort);
    await expect(getModeShareCode("x", null, controller.signal)).rejects.toBe(
      abort
    );
  });
});
