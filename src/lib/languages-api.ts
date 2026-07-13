import { buildConfigUrl } from "@/lib/config-url";
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
  signal?: AbortSignal,
  org?: string | null
): Promise<OrgLanguages> {
  const res = await fetch(buildConfigUrl("/api/config/languages", org), {
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
  signal?: AbortSignal,
  org?: string | null
): Promise<Language> {
  const res = await fetch(
    buildConfigUrl(`/api/config/languages/${encodeURIComponent(name)}`, org),
    {
      headers: SAME_ORIGIN_HEADERS,
      signal,
    }
  );

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

// #247 — a PUT that created the language via the worker's admin
// bootstrap carve-out comes back flagged (X-Bootstrap-Grant header):
// the worker auto-granted the caller edit + publish on the new slug,
// and the client mirrors that into its session user. An explicit wire
// signal, NOT client-side inference — inferring the carve-out from the
// local rights snapshot broke under session skew and published:true
// shapes (#256 review rounds 2–3).
export interface PutLanguageResult extends Language {
  bootstrapGranted: boolean;
}

export async function putLanguage(
  name: string,
  body: {
    label?: string;
    document: string;
    published?: boolean;
  },
  signal?: AbortSignal,
  org?: string | null
): Promise<PutLanguageResult> {
  const res = await fetch(
    buildConfigUrl(`/api/config/languages/${encodeURIComponent(name)}`, org),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (res.status === 403) {
    throw new LanguageForbiddenError(name, "write");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save language (${res.status}): ${text}`);
  }

  const bootstrapGranted = res.headers.get("X-Bootstrap-Grant") === "1";
  const data = (await res.json()) as Record<string, unknown>;

  // Worker wraps PUT response as { org, language, message }. Unwrap to
  // match getLanguage so callers consistently get a Language object.
  if ("language" in data && typeof data.language === "object") {
    return { ...(data.language as Language), bootstrapGranted };
  }
  return { ...(data as unknown as Language), bootstrapGranted };
}

export async function deleteLanguage(
  name: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const res = await fetch(
    buildConfigUrl(`/api/config/languages/${encodeURIComponent(name)}`, org),
    {
      method: "DELETE",
      headers: SAME_ORIGIN_HEADERS,
      signal,
    }
  );

  if (res.status === 403) {
    throw new LanguageForbiddenError(name, "delete");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete language (${res.status}): ${body}`);
  }
}
