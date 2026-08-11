import { buildConfigUrl } from "@/lib/config-url";
import type {
  Language,
  OrgDefaultLanguage,
  OrgLanguages,
} from "@/types/language";

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

// Thrown when DELETE is refused because the language is the org's default
// (#286 — upstream answers 409, "unset or reassign the default first").
// A distinct class so the delete dialog can render the actionable recovery
// step instead of the raw `Failed to delete language (409)` text.
export class LanguageIsDefaultError extends Error {
  constructor(public readonly languageName: string) {
    super(
      `"${languageName}" is this org's default language. Set a different default — or clear it — before deleting this language.`
    );
    this.name = "LanguageIsDefaultError";
  }
}

// Status codes that mean "this worker has no languages-default route yet"
// rather than "something went wrong". 404 is the honest answer from a
// worker predating worker#236; 501 is the explicit not-implemented shape.
// Both degrade to a hidden control — never a page-load error (#286).
function isUnsupportedStatus(status: number): boolean {
  return status === 404 || status === 501;
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

export async function putLanguage(
  name: string,
  body: {
    label?: string;
    document: string;
    published?: boolean;
  },
  signal?: AbortSignal,
  org?: string | null
): Promise<Language> {
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
  // #286 — upstream refuses to delete the language the org default points
  // at. Map it to the typed error so the confirmation dialog can tell the
  // user what to do about it (the generic branch below would surface the
  // upstream body verbatim).
  if (res.status === 409) {
    throw new LanguageIsDefaultError(name);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete language (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Org default language (#286 / worker#236)
// ---------------------------------------------------------------------------

// The route pair is deliberately `languages-default`, NOT
// `languages/default` — `default` is a legal language slug, so the nested
// form would collide with a real language named "default".
const DEFAULT_LANGUAGE_PATH = "/api/config/languages-default";

// Upstream answers `{ name: string | null }`. Anything else (a stray
// object, an empty string) normalizes to "no default" rather than being
// trusted as a slug — a bogus reference would render a warning about a
// language that doesn't exist.
function readDefaultName(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const name = (data as { name?: unknown }).name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed === "" ? null : trimmed;
}

export async function getOrgDefaultLanguage(
  signal?: AbortSignal,
  org?: string | null
): Promise<OrgDefaultLanguage> {
  const res = await fetch(buildConfigUrl(DEFAULT_LANGUAGE_PATH, org), {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  // Graceful absence: the worker endpoint ships in Ian's lane, so until it
  // lands every portal deploy gets a 404 here. Resolving (rather than
  // rejecting) keeps the Languages page free of a load-time error banner —
  // the caller renders the control as unavailable instead.
  if (isUnsupportedStatus(res.status)) {
    return { supported: false };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load default language (${res.status}): ${body}`);
  }

  return { supported: true, name: readDefaultName(await res.json()) };
}

// `name: null` clears the default; a slug sets it. Rejects with a
// user-presentable message — the control renders `error.message` inline.
export async function setOrgDefaultLanguage(
  name: string | null,
  signal?: AbortSignal,
  org?: string | null
): Promise<OrgDefaultLanguage> {
  const res = await fetch(buildConfigUrl(DEFAULT_LANGUAGE_PATH, org), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ name }),
    signal,
  });

  if (res.status === 403) {
    throw new Error(
      "You don't have permission to change this org's default language. Only admins can set or clear it."
    );
  }
  if (isUnsupportedStatus(res.status)) {
    throw new Error(
      "This org's worker doesn't support a default language yet. Reload once it's been deployed."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 400/409 from upstream carry the reason (unknown slug, for instance);
    // pass the body through so the user sees it rather than a bare status.
    throw new Error(
      `Failed to update the default language (${res.status})${body ? `: ${body}` : ""}`
    );
  }

  // Trust the server's echo when it sends one; a bodyless 204 falls back to
  // what we asked for, which is what the caller is about to render.
  const data: unknown = await res.json().catch(() => null);
  return {
    supported: true,
    name: data === null ? name : readDefaultName(data),
  };
}
