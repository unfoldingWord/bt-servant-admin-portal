import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LanguageForbiddenError,
  deleteLanguage,
  getLanguage,
  listLanguages,
  putLanguage,
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
});
