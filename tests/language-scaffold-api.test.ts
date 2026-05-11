import { afterEach, describe, expect, it, vi } from "vitest";

import { getLanguageScaffold } from "../src/lib/language-scaffold-api";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("getLanguageScaffold", () => {
  it("unwraps the wrapped worker response `{ org, scaffold }`", async () => {
    mockFetchOnce(200, {
      org: "uw",
      scaffold: { document: "## Tone & Register\n\nGuidance here." },
    });
    await expect(getLanguageScaffold()).resolves.toEqual({
      document: "## Tone & Register\n\nGuidance here.",
    });
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    // If the worker contract ever flips to returning the scaffold object
    // directly, the client should still return a valid LanguageScaffold.
    mockFetchOnce(200, { document: "## Section\n\nBody." });
    await expect(getLanguageScaffold()).resolves.toEqual({
      document: "## Section\n\nBody.",
    });
  });

  it("calls the BFF path (`/api/config/language-scaffold`) with same-origin header", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ scaffold: { document: "" } }), {
        status: 200,
      })
    );
    await getLanguageScaffold();
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("/api/config/language-scaffold");
    const headers = (init as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("throws with status and body when the response is not ok", async () => {
    mockFetchOnce(500, "engine unavailable");
    await expect(getLanguageScaffold()).rejects.toThrow(
      /Failed to load language scaffold \(500\)/
    );
  });

  it("forwards the AbortSignal to fetch", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ scaffold: { document: "" } }))
      );
    const controller = new AbortController();
    await getLanguageScaffold(controller.signal);
    expect(spy.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
  });
});
