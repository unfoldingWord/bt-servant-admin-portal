import type { Language, OrgLanguages } from "@/types/language";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

// Thrown when the worker (or engine) returns 403 on a language operation.
// Callers should catch this to render an inline permission message rather
// than the generic save-failed error.
export class LanguageForbiddenError extends Error {
  constructor(
    public readonly languageName: string,
    public readonly operation: "read" | "write" | "delete"
  ) {
    super(`Forbidden: ${operation} on language "${languageName}"`);
    this.name = "LanguageForbiddenError";
  }
}

export async function listLanguages(
  signal?: AbortSignal
): Promise<OrgLanguages> {
  const res = await fetch("/api/config/languages", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load languages (${res.status}): ${body}`);
  }

  return (await res.json()) as OrgLanguages;
}

export async function getLanguage(
  name: string,
  signal?: AbortSignal
): Promise<Language> {
  const res = await fetch(`/api/config/languages/${encodeURIComponent(name)}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (res.status === 403) {
    throw new LanguageForbiddenError(name, "read");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load language (${res.status}): ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Engine API may wrap in { org, language: {...} } (mirror of how
  // GET /modes/{name} wraps as { org, mode: {...} }). Unwrap if present.
  if ("language" in data && typeof data.language === "object") {
    return data.language as Language;
  }
  return data as unknown as Language;
}

export async function putLanguage(
  name: string,
  body: {
    label?: string;
    document: string;
    published?: boolean;
  },
  signal?: AbortSignal
): Promise<Language> {
  const res = await fetch(`/api/config/languages/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 403) {
    throw new LanguageForbiddenError(name, "write");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save language (${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Worker wraps PUT response as { org, language, message }. Unwrap to
  // match getLanguage so callers consistently get a Language object.
  if ("language" in data && typeof data.language === "object") {
    return data.language as Language;
  }
  return data as unknown as Language;
}

export async function deleteLanguage(
  name: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/config/languages/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (res.status === 403) {
    throw new LanguageForbiddenError(name, "delete");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete language (${res.status}): ${body}`);
  }
}
