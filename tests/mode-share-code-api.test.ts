import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getModeShareCode,
  ShareCodeRequestError,
} from "../src/lib/mode-share-code-api";
import { homeOrgWithoutModes } from "../src/lib/mode-share-link";

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
      queried_org: "PBT",
    });
    expect(await getModeShareCode("obt-coach", "PBT")).toEqual({
      capability: "present",
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "pbt",
      home_has_modes: false,
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    // #477: home_has_modes is absent when the home record couldn't be read;
    // it stays absent (unknown), not false.
    mockFetch(200, {
      capability: "present",
      code: "pbt/x",
      resolves: false,
      reason: "invalid_mode",
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    const unknownHome = await getModeShareCode("x", "PBT");
    expect(unknownHome).toEqual({
      capability: "present",
      code: "pbt/x",
      resolves: false,
      reason: "invalid_mode",
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    expect(homeOrgWithoutModes(unknownHome)).toBeNull();
    mockFetch(200, {
      capability: "present",
      code: "pbt/x",
      resolves: false,
      reason: "not_found",
      resolved_org_uncertain: true,
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    expect(await getModeShareCode("x", "PBT")).toMatchObject({
      reason: "not_found",
      resolved_org_uncertain: true,
    });
    // An empty code is malformed: a transient "server" failure.
    mockFetch(200, {
      capability: "present",
      code: "",
      resolves: true,
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "server",
    });
    // A code that resolves must be there: malformed without it.
    mockFetch(200, {
      capability: "present",
      code: null,
      resolves: true,
      home_org: "unfoldingWord",
      queried_org: "PBT",
    });
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "server",
    });
    // A present answer without the BFF's queried_org isn't one.
    mockFetch(200, {
      capability: "present",
      code: "x",
      resolves: true,
      home_org: "unfoldingWord",
    });
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "server",
    });
    // Retired 1.17.0-pre shape: not an answer.
    mockFetch(200, { capability: "absent", home: true });
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "server",
    });
    mockFetch(200, { capability: "unconfigured" });
    expect(await getModeShareCode("x", null)).toEqual({
      capability: "unconfigured",
    });
  });

  it("returns each definite failure as an answer, switching on the BFF's code only", async () => {
    const cases: [number, unknown][] = [
      [404, { error: "Mode not found", code: "mode_not_found" }],
      [405, { error: "Method not allowed", code: "method_not_allowed" }],
      [400, { error: "Invalid mode name", code: "invalid_mode_name" }],
      [400, { error: "Invalid org", code: "invalid_org" }],
      [400, { error: "Bad request", code: "bad_request" }],
      // The human text alone means nothing: no code, a generic bad request.
      [400, { error: "Invalid org parameter" }],
      [400, { error: "invalid_mode_name" }],
      [400, "not json"],
      [500, { error: "Corrupt modes record", code: "corrupt_modes_record" }],
      // The portal's own engine credentials refused: a definite answer.
      [
        502,
        {
          error: "BT Servant refused the portal's credentials",
          code: "engine_auth",
        },
      ],
      [
        404,
        {
          error: "Share codes need a newer BT Servant",
          code: "share_code_unsupported",
        },
      ],
    ];
    const got = [];
    for (const [status, body] of cases) {
      mockFetch(status, body);
      got.push(await getModeShareCode("x", null));
    }
    expect(got).toEqual([
      { capability: "not-found" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "invalid-name" },
      { capability: "failed", failure: "org-invalid" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "bad-request" },
      { capability: "failed", failure: "corrupt-record" },
      { capability: "failed", failure: "engine-auth" },
      { capability: "upgrade-needed" },
    ]);
  });

  it("reads any other 404 as a route that exists: a transient server error", async () => {
    // Only the BFF's share_code_unsupported means "upgrade"; the BFF route
    // always exists in this portal, so a plain or empty 404 is no signal.
    for (const body of [
      { error: "mode_not_found" },
      { error: "Engine error", code: "engine_error" },
      "404 Not Found",
      "",
    ]) {
      mockFetch(404, body);
      await expect(getModeShareCode("x", null)).rejects.toMatchObject({
        kind: "server",
      });
    }
  });

  it("throws a typed error for each transient outcome, so a refetch keeps the last answer", async () => {
    const cases: [number, unknown, string][] = [
      // 401/403 are retried, not cached as answers: a session blip mustn't
      // stick for the stale time. With or without a code.
      [401, { error: "Unauthorized", code: "unauthorized" }, "signed-out"],
      [401, "Unauthorized", "signed-out"],
      [403, { error: "Forbidden", code: "forbidden" }, "forbidden"],
      [403, "Forbidden", "forbidden"],
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

  it("reads a present answer without home_org (withheld by the BFF)", async () => {
    mockFetch(200, {
      capability: "present",
      code: "pbt/x",
      resolves: true,
      queried_org: "PBT",
      home_has_modes: false,
    });
    const answer = await getModeShareCode("x", null);
    expect(answer).toMatchObject({ capability: "present", queried_org: "PBT" });
    expect(answer).not.toHaveProperty("home_org");
  });

  it("answers a cross-org 403 as a definite failure; any other 403 stays retryable", async () => {
    mockFetch(403, {
      error: "Cross-org config access requires isSuperAdmin",
      code: "cross_org_forbidden",
    });
    await expect(getModeShareCode("x", "Other")).resolves.toEqual({
      capability: "failed",
      failure: "cross-org-forbidden",
    });
    // The same-origin guard, an uncoded body, or one that can't be read:
    // retryable "forbidden". A 401 stays "signed-out".
    for (const body of [{ error: "Forbidden", code: "forbidden" }, "nope"]) {
      mockFetch(403, body);
      await expect(getModeShareCode("x", null)).rejects.toMatchObject({
        kind: "forbidden",
      });
    }
    mockFetch(401, { error: "Unauthorized", code: "unauthorized" });
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "signed-out",
    });
  });

  it("throws a server error for a malformed 200", async () => {
    for (const body of [
      "not json",
      { capability: "present", code: 7, resolves: true },
      { capability: "present", code: "x" },
      // A present answer without the BFF's queried_org isn't one.
      { capability: "present", code: "x", resolves: true, home_org: "uW" },
      // A home_org that isn't a string isn't one either.
      {
        capability: "present",
        code: "x",
        resolves: true,
        home_org: 7,
        queried_org: "PBT",
      },
      { capability: "who-knows" },
    ]) {
      mockFetch(200, body);
      await expect(getModeShareCode("x", null)).rejects.toMatchObject({
        kind: "server",
      });
    }
  });

  it("decides 401 / 503 by status before reading the body, and a 403 whose body is cut off as retryable", async () => {
    const cut = (status: number) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("connection reset"));
          },
        }),
        { status }
      );
    for (const [status, kind] of [
      [401, "signed-out"],
      [403, "forbidden"],
      [503, "unavailable"],
    ] as const) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(cut(status));
      await expect(getModeShareCode("x", null)).rejects.toMatchObject({
        kind,
      });
    }
  });

  it("throws network when the body read fails, and keeps a cancelled read a cancellation", async () => {
    const cutBody = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("connection reset"));
          },
        }),
        { status: 404 }
      );
    // Even on a 404, a body cut off mid-read is not "no JSON".
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(cutBody());
    await expect(getModeShareCode("x", null)).rejects.toMatchObject({
      kind: "network",
    });
    const controller = new AbortController();
    const abort = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            c.error(abort);
          },
        }),
        { status: 200 }
      )
    );
    controller.abort();
    await expect(
      getModeShareCode("x", null, controller.signal)
    ).rejects.not.toBeInstanceOf(ShareCodeRequestError);
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
