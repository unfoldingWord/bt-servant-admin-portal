import type { Language, OrgLanguages } from "@/types/language";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save language (${res.status}): ${text}`);
  }

  return (await res.json()) as Language;
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete language (${res.status}): ${body}`);
  }
}
