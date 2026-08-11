import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LanguageForbiddenError,
  LanguageIsDefaultError,
  deleteLanguage,
  getLanguage,
  getOrgDefaultLanguage,
  listLanguages,
  putLanguage,
  setOrgDefaultLanguage,
} from "../src/lib/languages-api";

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

describe("putLanguage", () => {
  it("unwraps the wrapped worker response `{ org, language, message }`", async () => {
    // Before this PR the function cast the wrapped envelope directly as
    // `Language`, so `result.name` was undefined. The unwrap brings PUT in
    // line with GET (which already unwrapped `{ org, language }`).
    mockFetchOnce(200, {
      org: "uw",
      language: {
        name: "arabic",
        label: "Arabic",
        document: "## Tone\n",
        published: false,
      },
      message: "Language saved",
    });

    const result = await putLanguage("arabic", {
      label: "Arabic",
      document: "## Tone\n",
      published: false,
    });

    expect(result).toEqual({
      name: "arabic",
      label: "Arabic",
      document: "## Tone\n",
      published: false,
    });
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    mockFetchOnce(200, {
      name: "arabic",
      label: "Arabic",
      document: "## Tone\n",
      published: false,
    });

    const result = await putLanguage("arabic", {
      label: "Arabic",
      document: "## Tone\n",
      published: false,
    });

    expect(result.name).toBe("arabic");
  });

  it("throws LanguageForbiddenError on 403", async () => {
    mockFetchOnce(403, { error: "Forbidden" });
    await expect(
      putLanguage("arabic", { document: "x" })
    ).rejects.toBeInstanceOf(LanguageForbiddenError);
  });

  it("encodes the language name in the URL path", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ language: { name: "haitian-creole", document: "" } })
        )
      );
    await putLanguage("haitian-creole", { document: "" });
    expect(spy.mock.calls[0]![0]).toBe("/api/config/languages/haitian-creole");
  });

  it("sends the body as JSON with PUT method", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ language: { name: "arabic", document: "" } })
        )
      );
    const body = { label: "Arabic", document: "## Tone\n", published: true };
    await putLanguage("arabic", body);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });
});

describe("listLanguages", () => {
  it("returns the response JSON unchanged", async () => {
    const payload = {
      languages: [{ name: "arabic", label: "Arabic", document: "" }],
    };
    mockFetchOnce(200, payload);
    expect(await listLanguages()).toEqual(payload);
  });

  it("sends GET with the same-origin marker", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ languages: [] })));
    await listLanguages();
    expect(spy.mock.calls[0]![0]).toBe("/api/config/languages");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("throws on non-ok response", async () => {
    mockFetchOnce(500, "boom");
    await expect(listLanguages()).rejects.toThrow(
      /Failed to load languages \(500\)/
    );
  });
});

describe("getLanguage", () => {
  it("unwraps the wrapped engine response `{ org, language }`", async () => {
    mockFetchOnce(200, {
      org: "uw",
      language: {
        name: "arabic",
        label: "Arabic",
        document: "## Tone\n",
        published: true,
      },
    });
    const result = await getLanguage("arabic");
    expect(result).toEqual({
      name: "arabic",
      label: "Arabic",
      document: "## Tone\n",
      published: true,
    });
  });

  it("returns an already-unwrapped response unchanged (back-compat)", async () => {
    mockFetchOnce(200, { name: "arabic", document: "" });
    const result = await getLanguage("arabic");
    expect(result.name).toBe("arabic");
  });

  it("throws LanguageForbiddenError on 403 with operation `read`", async () => {
    // Operation discriminant is load-bearing for the UI's permission
    // messaging — `read` shows "view permission" copy, `write` shows
    // "edit permission" copy, `delete` shows "delete permission" copy.
    mockFetchOnce(403, { error: "Forbidden" });
    try {
      await getLanguage("arabic");
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(LanguageForbiddenError);
      const err = e as LanguageForbiddenError;
      expect(err.operation).toBe("read");
      expect(err.languageName).toBe("arabic");
    }
  });

  it("throws generic Error on non-403 4xx", async () => {
    mockFetchOnce(404, "Language not found");
    await expect(getLanguage("missing")).rejects.toThrow(
      /Failed to load language \(404\): Language not found/
    );
  });

  it("URL-encodes the language name", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ language: { name: "haitian-creole", document: "" } })
        )
      );
    await getLanguage("haitian-creole");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/languages/haitian-creole");
  });
});

describe("deleteLanguage", () => {
  it("sends DELETE with URL-encoded name", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteLanguage("haitian-creole");
    expect(spy.mock.calls[0]![0]).toBe("/api/config/languages/haitian-creole");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("throws LanguageForbiddenError on 403 with operation `delete`", async () => {
    mockFetchOnce(403, { error: "Forbidden" });
    try {
      await deleteLanguage("arabic");
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(LanguageForbiddenError);
      const err = e as LanguageForbiddenError;
      expect(err.operation).toBe("delete");
      expect(err.languageName).toBe("arabic");
    }
  });

  it("throws generic Error on non-403 4xx", async () => {
    mockFetchOnce(404, "Language not found");
    await expect(deleteLanguage("missing")).rejects.toThrow(
      /Failed to delete language \(404\)/
    );
  });

  it("throws LanguageIsDefaultError on 409 with an actionable message (#286)", async () => {
    // Upstream refuses to delete the language the org default points at.
    // The dialog renders `error.message` verbatim, so the recovery step
    // ("set a different default, or clear it") has to live in the message
    // rather than in the raw upstream body.
    mockFetchOnce(409, "unset or reassign the default first");
    try {
      await deleteLanguage("hindi");
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(LanguageIsDefaultError);
      const err = e as LanguageIsDefaultError;
      expect(err.languageName).toBe("hindi");
      expect(err.message).toContain("default");
      expect(err.message).toMatch(/clear it|different default/);
    }
  });

  it("409 is distinguishable from a permission failure", async () => {
    mockFetchOnce(409, "");
    await expect(deleteLanguage("hindi")).rejects.not.toBeInstanceOf(
      LanguageForbiddenError
    );
  });
});

// ---------------------------------------------------------------------------
// Org default language (#286 / worker#236)
// ---------------------------------------------------------------------------

describe("getOrgDefaultLanguage", () => {
  it("reads the sibling route, not /languages/default", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "hindi" })));
    await getOrgDefaultLanguage();
    expect(spy.mock.calls[0]![0]).toBe("/api/config/languages-default");
  });

  it("returns the slug when one is set", async () => {
    mockFetchOnce(200, { name: "hindi" });
    expect(await getOrgDefaultLanguage()).toEqual({
      supported: true,
      name: "hindi",
    });
  });

  it("returns supported-with-null when no default is set", async () => {
    mockFetchOnce(200, { name: null });
    expect(await getOrgDefaultLanguage()).toEqual({
      supported: true,
      name: null,
    });
  });

  it("RESOLVES as unsupported on 404 — the worker route isn't deployed yet", async () => {
    // Rejecting here would put an error banner on the Languages page for
    // every org until worker#236 ships. The control hides itself instead.
    mockFetchOnce(404, "Not found");
    expect(await getOrgDefaultLanguage()).toEqual({ supported: false });
  });

  it("RESOLVES as unsupported on 501", async () => {
    mockFetchOnce(501, "Not implemented");
    expect(await getOrgDefaultLanguage()).toEqual({ supported: false });
  });

  it("still rejects on a real failure (500) — absence is not the same as broken", async () => {
    mockFetchOnce(500, "boom");
    await expect(getOrgDefaultLanguage()).rejects.toThrow(
      /Failed to load default language \(500\)/
    );
  });

  it("normalizes a blank or non-string name to 'no default'", async () => {
    mockFetchOnce(200, { name: "   " });
    expect(await getOrgDefaultLanguage()).toEqual({
      supported: true,
      name: null,
    });
    mockFetchOnce(200, { name: 42 });
    expect(await getOrgDefaultLanguage()).toEqual({
      supported: true,
      name: null,
    });
  });

  it("threads ?org= for the cross-org view", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: null })));
    await getOrgDefaultLanguage(undefined, "word-collective");
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/config/languages-default?org=word-collective"
    );
  });
});

describe("setOrgDefaultLanguage", () => {
  it("PUTs { name } to set", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "hindi" })));
    const result = await setOrgDefaultLanguage("hindi");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ name: "hindi" });
    expect(result).toEqual({ supported: true, name: "hindi" });
  });

  it("PUTs { name: null } to clear", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: null })));
    const result = await setOrgDefaultLanguage(null);
    expect(
      JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)
    ).toEqual({ name: null });
    expect(result).toEqual({ supported: true, name: null });
  });

  it("falls back to the requested value when the server sends no body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );
    expect(await setOrgDefaultLanguage("hindi")).toEqual({
      supported: true,
      name: "hindi",
    });
  });

  it("403 rejects with the admin-only explanation", async () => {
    mockFetchOnce(403, { error: "Forbidden" });
    await expect(setOrgDefaultLanguage("hindi")).rejects.toThrow(
      /Only admins can set or clear it/
    );
  });

  it("404 rejects with the not-deployed-yet explanation, not a bare status", async () => {
    mockFetchOnce(404, "Not found");
    await expect(setOrgDefaultLanguage("hindi")).rejects.toThrow(
      /doesn't support a default language yet/
    );
  });

  it("surfaces the upstream reason on a validation failure", async () => {
    mockFetchOnce(409, "no such language: nope");
    await expect(setOrgDefaultLanguage("nope")).rejects.toThrow(
      /no such language: nope/
    );
  });

  it("threads ?org= so the write lands on the org being viewed", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "hindi" })));
    await setOrgDefaultLanguage("hindi", undefined, "word-collective");
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/config/languages-default?org=word-collective"
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-org override threading (#166 PR B)
// ---------------------------------------------------------------------------

describe("languages-api cross-org threading", () => {
  function urlOf(spy: { mock: { calls: unknown[][] } }, call = 0): string {
    return String(spy.mock.calls[call]![0]);
  }

  it("listLanguages() with no org → no ?org=", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ languages: [] })));
    await listLanguages();
    expect(urlOf(spy)).toBe("/api/config/languages");
  });

  it("listLanguages with org → ?org=word-collective", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ languages: [] })));
    await listLanguages(undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/languages?org=word-collective");
  });

  it("getLanguage threads org through and still encodes the name", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ language: { name: "arabic", document: "" } })
        )
      );
    await getLanguage("arabic", undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/languages/arabic?org=word-collective");
  });

  it("putLanguage threads org through (mutation must use same ?org=)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ language: { name: "arabic", document: "x" } })
        )
      );
    await putLanguage(
      "arabic",
      { document: "x" },
      undefined,
      "word-collective"
    );
    expect(urlOf(spy)).toBe("/api/config/languages/arabic?org=word-collective");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("deleteLanguage threads org through", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteLanguage("arabic", undefined, "word-collective");
    expect(urlOf(spy)).toBe("/api/config/languages/arabic?org=word-collective");
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("LanguageForbiddenError still surfaces under cross-org (server-side gate intact)", async () => {
    // PR A's worker carve-out lets super admins bypass `hasLanguageRights`
    // ONLY when ?org= is set AND the target differs from session.org. A
    // 403 from upstream still needs to land as LanguageForbiddenError so
    // the UI renders the inline permission message instead of the
    // generic save-failed error — the cross-org code path must not eat
    // the error-class plumbing.
    mockFetchOnce(403, { error: "Forbidden" });
    try {
      await putLanguage(
        "arabic",
        { document: "x" },
        undefined,
        "word-collective"
      );
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(LanguageForbiddenError);
      const err = e as LanguageForbiddenError;
      expect(err.operation).toBe("write");
    }
  });
});
