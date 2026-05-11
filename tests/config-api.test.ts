import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMode,
  getOrgOverrides,
  putMode,
  putOrgOverrides,
} from "../src/lib/config-api";

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

describe("getMode", () => {
  it("unwraps the wrapped worker response `{ org, mode }`", async () => {
    mockFetchOnce(200, {
      org: "uw",
      mode: {
        name: "spoken",
        label: "Spoken",
        document: "## Identity\n\nYou are…\n",
        published: true,
        format: "markdown",
      },
    });

    const result = await getMode("spoken");

    expect(result).toEqual({
      name: "spoken",
      label: "Spoken",
      document: "## Identity\n\nYou are…\n",
      published: true,
      format: "markdown",
    });
  });

  it("passes through the diagnostic `originalSlots` field on legacy modes", async () => {
    // Worker #213 attaches `originalSlots` on GET for not-yet-migrated modes.
    // The portal ignores it, but it must not be stripped or break the unwrap.
    mockFetchOnce(200, {
      org: "uw",
      mode: {
        name: "legacy",
        document: "## Identity\n\nhi\n",
        format: "markdown",
        originalSlots: { identity: "hi" },
      },
    });

    const result = await getMode("legacy");

    expect(result.name).toBe("legacy");
    expect(result.document).toBe("## Identity\n\nhi\n");
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    mockFetchOnce(200, {
      name: "spoken",
      label: "Spoken",
      document: "",
      published: false,
    });

    const result = await getMode("spoken");

    expect(result.name).toBe("spoken");
  });

  it("encodes the mode name in the URL path", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mode: { name: "kids-mode", document: "" } })
        )
      );
    await getMode("kids-mode");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/kids-mode");
  });

  it("throws with the response body on 4xx", async () => {
    mockFetchOnce(404, "Mode not found");
    await expect(getMode("missing")).rejects.toThrow(
      /Failed to load mode \(404\): Mode not found/
    );
  });
});

describe("putMode", () => {
  it("unwraps the wrapped worker response `{ org, mode, message }`", async () => {
    // Worker #213 wraps PUT response in the same envelope as GET. Before this
    // PR the function cast the wrapped envelope directly as `PromptMode`, so
    // `result.name` was undefined — same class of bug fixed for putLanguage
    // in #106.
    mockFetchOnce(200, {
      org: "uw",
      mode: {
        name: "spoken",
        label: "Spoken",
        document: "## Identity\n\nYou are…\n",
        published: false,
      },
      message: "Mode saved",
    });

    const result = await putMode("spoken", {
      label: "Spoken",
      document: "## Identity\n\nYou are…\n",
      published: false,
    });

    expect(result).toEqual({
      name: "spoken",
      label: "Spoken",
      document: "## Identity\n\nYou are…\n",
      published: false,
    });
  });

  it("sends the body as JSON with PUT method and `document` field", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "spoken", document: "" } }))
      );
    const body = {
      label: "Spoken",
      description: "Conversational",
      document: "## Identity\n",
      published: true,
    };
    await putMode("spoken", body);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("does NOT send a legacy `overrides` field", async () => {
    // Portal #82 AC: the mode editor handles only markdown — no legacy
    // slot-map awareness in src/lib. The worker would reject a PUT that
    // includes both `document` and `overrides`, so this is also a
    // contract-safety check.
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "spoken", document: "" } }))
      );
    await putMode("spoken", { document: "## Identity\n" });
    const init = spy.mock.calls[0]![1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("overrides");
  });

  it("encodes the mode name in the URL path", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mode: { name: "kids-mode", document: "" } })
        )
      );
    await putMode("kids-mode", { document: "" });
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/kids-mode");
  });

  it("throws with the response body on 4xx", async () => {
    mockFetchOnce(400, "Mode document exceeds maximum length");
    await expect(
      putMode("spoken", { document: "x".repeat(64_001) })
    ).rejects.toThrow(
      /Failed to save mode \(400\): Mode document exceeds maximum length/
    );
  });
});

describe("getOrgOverrides", () => {
  it("unwraps `{ prompt_overrides }` envelope", async () => {
    mockFetchOnce(200, {
      prompt_overrides: { identity: "hi", closing: "bye" },
    });

    const result = await getOrgOverrides();

    expect(result).toEqual({ identity: "hi", closing: "bye" });
  });

  it("unwraps `{ org, overrides }` envelope", async () => {
    mockFetchOnce(200, {
      org: "uw",
      overrides: { identity: "hi" },
    });

    const result = await getOrgOverrides();

    expect(result).toEqual({ identity: "hi" });
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    mockFetchOnce(200, { identity: "hi", closing: "bye" });

    const result = await getOrgOverrides();

    expect(result).toEqual({ identity: "hi", closing: "bye" });
  });
});

describe("putOrgOverrides", () => {
  it("unwraps `{ org, overrides, message }` envelope", async () => {
    // Pre-fix the cast-as-PromptOverrides returned the wrapper, so a caller
    // reading `result.identity` got undefined. Same class of bug as the
    // putLanguage/putMode envelope fixes from #106 / #110.
    mockFetchOnce(200, {
      org: "uw",
      overrides: { identity: "hi", closing: "bye" },
      message: "Overrides saved",
    });

    const result = await putOrgOverrides({ identity: "hi", closing: "bye" });

    expect(result).toEqual({ identity: "hi", closing: "bye" });
  });

  it("unwraps `{ prompt_overrides }` envelope", async () => {
    mockFetchOnce(200, {
      prompt_overrides: { identity: "hi" },
    });

    const result = await putOrgOverrides({ identity: "hi" });

    expect(result).toEqual({ identity: "hi" });
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    mockFetchOnce(200, { identity: "hi" });

    const result = await putOrgOverrides({ identity: "hi" });

    expect(result).toEqual({ identity: "hi" });
  });

  it("sends the body as JSON with PUT method", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ overrides: { identity: "hi" } }))
      );
    await putOrgOverrides({ identity: "hi" });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ identity: "hi" });
  });

  it("throws with the response body on 4xx", async () => {
    mockFetchOnce(403, "Forbidden");
    await expect(putOrgOverrides({ identity: "hi" })).rejects.toThrow(
      /Failed to save overrides \(403\): Forbidden/
    );
  });
});
