import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageForbiddenError, putLanguage } from "../src/lib/languages-api";

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
