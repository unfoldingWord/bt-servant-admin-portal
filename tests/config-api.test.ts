import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearUserMode,
  cloneMode,
  deleteMode,
  deleteUserMemory,
  getMode,
  getOrgOverrides,
  getUserMemory,
  listModes,
  putMode,
  putOrgOverrides,
  renameMode,
  setUserMode,
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

describe("listModes", () => {
  it("returns the response JSON unchanged", async () => {
    const payload = { modes: [{ name: "spoken", document: "" }] };
    mockFetchOnce(200, payload);
    expect(await listModes()).toEqual(payload);
  });

  it("sends a GET to the modes endpoint with the same-origin marker", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ modes: [] })));
    await listModes();
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(500, "Engine error");
    await expect(listModes()).rejects.toThrow(/Failed to load modes \(500\)/);
  });
});

describe("deleteMode", () => {
  it("sends DELETE and URL-encodes the name", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteMode("kids-mode");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/kids-mode");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("throws on non-ok response with status + body", async () => {
    mockFetchOnce(404, "Mode not found");
    await expect(deleteMode("missing")).rejects.toThrow(
      /Failed to delete mode \(404\): Mode not found/
    );
  });
});

describe("renameMode", () => {
  it("POSTs `{ newName }` to the _rename endpoint and unwraps the envelope", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          org: "uw",
          mode: { name: "conversation", document: "## Identity\n" },
          message: "Mode renamed",
        }),
        { status: 200 }
      )
    );
    const result = await renameMode("spoken", "conversation");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/spoken/_rename");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      newName: "conversation",
    });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    // Returns the renamed mode (new canonical name), envelope unwrapped.
    expect(result.name).toBe("conversation");
  });

  it("URL-encodes the source mode name in the path", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "new", document: "" } }))
      );
    await renameMode("kids mode", "new");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/kids%20mode/_rename");
  });

  it("surfaces the engine's JSON `{ error }` message on a slug collision", async () => {
    // The engine rejects a colliding/invalid new slug with `{ error }` JSON
    // (409/400). The dialog shows this inline, so the message must be the
    // engine string — not the raw `{"error":"…"}` blob.
    mockFetchOnce(409, { error: "Mode 'conversation' already exists" });
    await expect(renameMode("spoken", "conversation")).rejects.toThrow(
      /Failed to rename mode \(409\): Mode 'conversation' already exists/
    );
  });

  it("falls back to raw text when the error body isn't JSON", async () => {
    mockFetchOnce(500, "upstream boom");
    await expect(renameMode("spoken", "conversation")).rejects.toThrow(
      /Failed to rename mode \(500\): upstream boom/
    );
  });

  it("threads org through as ?org=", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "new", document: "" } }))
      );
    await renameMode("spoken", "new", undefined, "word-collective");
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/config/modes/spoken/_rename?org=word-collective"
    );
  });
});

describe("cloneMode", () => {
  it("POSTs `{ newName, newLabel? }` to the _clone endpoint and unwraps the envelope", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          org: "uw",
          mode: {
            name: "spoken-v2",
            label: "Spoken v2",
            document: "## Identity\n",
            published: false,
          },
          message: "Mode cloned",
        }),
        { status: 200 }
      )
    );
    const result = await cloneMode("spoken", {
      newName: "spoken-v2",
      newLabel: "Spoken v2",
    });
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/spoken/_clone");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      newName: "spoken-v2",
      newLabel: "Spoken v2",
    });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    // Returns the cloned mode (new canonical name, draft), envelope unwrapped.
    expect(result.name).toBe("spoken-v2");
    expect(result.published).toBe(false);
  });

  it("omits newLabel from the body when not provided (engine treats as unset)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "new", document: "" } }))
      );
    await cloneMode("spoken", { newName: "new" });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ newName: "new" });
  });

  it("URL-encodes the source mode name in the path", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "new", document: "" } }))
      );
    await cloneMode("kids mode", { newName: "new" });
    expect(spy.mock.calls[0]![0]).toBe("/api/config/modes/kids%20mode/_clone");
  });

  it("surfaces the engine's JSON `{ error }` message on a slug collision", async () => {
    // Engine returns 409 for a collision against another mode's name OR
    // alias. Dialog shows this inline; the message must be the engine
    // string, not the raw JSON blob.
    mockFetchOnce(409, {
      error: 'Slug "conversation" already belongs to another mode in this org',
    });
    await expect(
      cloneMode("spoken", { newName: "conversation" })
    ).rejects.toThrow(
      /Failed to clone mode \(409\): Slug "conversation" already belongs/
    );
  });

  it("falls back to raw text when the error body isn't JSON", async () => {
    mockFetchOnce(500, "upstream boom");
    await expect(cloneMode("spoken", { newName: "new" })).rejects.toThrow(
      /Failed to clone mode \(500\): upstream boom/
    );
  });

  it("threads org through as ?org=", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ mode: { name: "new", document: "" } }))
      );
    await cloneMode("spoken", { newName: "new" }, undefined, "word-collective");
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/config/modes/spoken/_clone?org=word-collective"
    );
  });
});

// User-memory + user-mode endpoints take a UUID-v4 user id that the worker
// validates upstream (`worker/config.ts`); the client's job is to URL-encode
// it and use the right method + body shape. A refactor that breaks `{ mode }`
// to `{ name }` on `setUserMode` would silently 400 at the worker, so the
// body-shape assertion is load-bearing.
const SAMPLE_UUID = "abc12345-6789-4abc-89ab-cdef01234567";

describe("getUserMemory", () => {
  it("sends GET with URL-encoded user id", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ memory: {} })));
    await getUserMemory(SAMPLE_UUID);
    expect(spy.mock.calls[0]![0]).toBe(
      `/api/config/user-memory/${SAMPLE_UUID}`
    );
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBeUndefined();
  });

  it("returns the response JSON unchanged", async () => {
    const payload = { memory: { facts: ["foo"] }, message: "ok" };
    mockFetchOnce(200, payload);
    expect(await getUserMemory(SAMPLE_UUID)).toEqual(payload);
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(404, "Not found");
    await expect(getUserMemory(SAMPLE_UUID)).rejects.toThrow(
      /Failed to load user memory \(404\)/
    );
  });
});

describe("deleteUserMemory", () => {
  it("sends DELETE with URL-encoded user id", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteUserMemory(SAMPLE_UUID);
    expect(spy.mock.calls[0]![0]).toBe(
      `/api/config/user-memory/${SAMPLE_UUID}`
    );
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(500, "boom");
    await expect(deleteUserMemory(SAMPLE_UUID)).rejects.toThrow(
      /Failed to delete user memory \(500\)/
    );
  });
});

describe("setUserMode", () => {
  it("sends PUT with the body `{ mode }` (NOT `{ name }`)", async () => {
    // Easy to mis-refactor to `{ name }` since the function param is the
    // mode name. The worker validates the field at upstream. Pin the wire
    // shape here so a refactor fails CI rather than 400ing in production.
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await setUserMode(SAMPLE_UUID, "spoken");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ mode: "spoken" });
  });

  it("URL-encodes the user id and sends Content-Type application/json", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await setUserMode(SAMPLE_UUID, "spoken");
    expect(spy.mock.calls[0]![0]).toBe(`/api/config/user-mode/${SAMPLE_UUID}`);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(400, "Invalid mode");
    await expect(setUserMode(SAMPLE_UUID, "bad")).rejects.toThrow(
      /Failed to set user mode \(400\)/
    );
  });
});

describe("clearUserMode", () => {
  it("sends DELETE with URL-encoded user id", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await clearUserMode(SAMPLE_UUID);
    expect(spy.mock.calls[0]![0]).toBe(`/api/config/user-mode/${SAMPLE_UUID}`);
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(500, "engine down");
    await expect(clearUserMode(SAMPLE_UUID)).rejects.toThrow(
      /Failed to clear user mode \(500\)/
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-org override threading (#166 PR B)
// ---------------------------------------------------------------------------
//
// The portal-side switch ships in two pieces — worker (PR A, merged) and UI
// (this PR). These tests pin the wire format that the worker's `resolveOrg`
// expects: `?org=<encoded>` only when the caller supplies a non-empty slug;
// otherwise the URL is identical to the legacy same-org call so the existing
// org-admin path is byte-for-byte unchanged.

describe("config-api cross-org threading", () => {
  function urlOf(spy: { mock: { calls: unknown[][] } }, call = 0): string {
    return String(spy.mock.calls[call]![0]);
  }

  it("listModes(undefined, undefined) → no ?org=", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ modes: [] })));
    await listModes();
    expect(urlOf(spy)).toBe("/api/config/modes");
  });

  it("listModes(_, 'word-collective') → ?org=word-collective", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ modes: [] })));
    await listModes(undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/modes?org=word-collective");
  });

  it("getMode encodes both the path segment and the org param", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mode: { name: "kids-mode", document: "" } })
        )
      );
    await getMode("kids-mode", undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/modes/kids-mode?org=word-collective");
  });

  it("putMode threads org through (mutations must use the same ?org=)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mode: { name: "spoken", document: "x" } })
        )
      );
    await putMode("spoken", { document: "x" }, undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/modes/spoken?org=word-collective");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("deleteMode threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteMode("legacy", undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/modes/legacy?org=word-collective");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("getOrgOverrides threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({})));
    await getOrgOverrides(undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/prompt-overrides?org=word-collective");
  });

  it("putOrgOverrides threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({})));
    await putOrgOverrides({ identity: "x" }, undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/prompt-overrides?org=word-collective");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("getUserMemory threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ memory: {} })));
    await getUserMemory(SAMPLE_UUID, undefined, "word-collective");
    expect(urlOf(spy)).toBe(
      `/api/config/user-memory/${SAMPLE_UUID}?org=word-collective`
    );
  });

  it("setUserMode threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await setUserMode(SAMPLE_UUID, "spoken", undefined, "word-collective");
    expect(urlOf(spy)).toBe(
      `/api/config/user-mode/${SAMPLE_UUID}?org=word-collective`
    );
  });

  it("listModes with null org acts identically to omitted org", async () => {
    // The UI passes `contextOrg ?? null` through hooks; `null` must hash to
    // the same URL as `undefined` so the same-org cache and the unset cache
    // don't double-fetch.
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ modes: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ modes: [] })));
    await listModes(undefined, null);
    await listModes();
    expect(urlOf(spy, 0)).toBe("/api/config/modes");
    expect(urlOf(spy, 1)).toBe("/api/config/modes");
  });
});
