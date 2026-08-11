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

// Thrown when DELETE is refused with a 409. worker#236 specifies exactly
// one 409 on this route — "the language is the org default; unset or
// reassign it first" — but does NOT pin an error body, so there is no
// discriminator to key on and a future second conflict reason would land
// here too. The wording therefore leads with the observable fact (the
// delete was refused) and offers the known cause as the likely one:
// confidently wrong copy is worse than hedged copy the user can act on.
// Tighten this to an exact claim once the upstream body shape is known.
//
// The message here is deliberately ROLE-NEUTRAL: it states the situation
// and stops. Whether the reader can perform the recovery (changing the org
// default is admin-only, while deleting a language only needs per-row
// edit+publish) is not knowable in this layer, so the render layer
// composes the actionable sentence — see `describeLanguageDeleteError` in
// src/lib/language-error-surface.ts.
export class LanguageIsDefaultError extends Error {
  constructor(public readonly languageName: string) {
    super(
      `"${languageName}" can't be deleted right now — it may be this org's default language, which has to be changed or cleared first.`
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

// Upstream answers `{ name: string | null }`.
//
// The read is DISCRIMINATED — "the body didn't tell us" is a different
// answer from "the body said there is no default" (#286 review rd-3).
// Collapsing both to `null` was fine for GET, where either way there's
// nothing to show, but wrong for PUT: the caller falls back to the
// requested slug when the envelope is unreadable, and a valid
// `{"name": null}` echo (the server saying "it is now unset") would get
// overwritten by the very slug the server declined to store.
//
// A `name` present but neither string nor null (`42`, an object) counts as
// UNRECOGNIZED, not as an explicit unset: a garbage value is evidence the
// envelope isn't what we think it is, not a statement about the default.
type DefaultNameRead =
  | { present: false }
  | { present: true; name: string | null };

function readDefaultName(data: unknown): DefaultNameRead {
  if (data === null || typeof data !== "object") return { present: false };
  if (!("name" in data)) return { present: false };
  const name = (data as { name?: unknown }).name;
  if (name === null) return { present: true, name: null };
  if (typeof name !== "string") return { present: false };
  // An empty/whitespace slug is a name-shaped nothing — normalize it to
  // "no default" rather than letting it through as a reference that would
  // render a warning about a language nobody can find.
  const trimmed = name.trim();
  return { present: true, name: trimmed === "" ? null : trimmed };
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

  // On the READ path both "no name field" and "name: null" mean the same
  // thing to the caller: this org has no default.
  const echo = readDefaultName(await res.json());
  return { supported: true, name: echo.present ? echo.name : null };
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

  // Server echo wins whenever the body actually carries one — INCLUDING an
  // explicit `{"name": null}`. The server saying "it is now unset" is a
  // fact about the org, and overwriting it with the slug we asked for
  // would report a default that upstream just declined to store.
  //
  // The fallback exists only for the case where the body tells us nothing:
  // worker#236 fixes the request shape but not the response envelope, so a
  // 2xx we don't recognize (`{}`, `{"ok":true}`,
  // `{"defaultLanguage":"hindi"}`, a bodyless 204) must not read as "the
  // default is now unset" — that would make a SUCCESSFUL set render "No
  // default language is set". The mutation's cache invalidation is the
  // backstop that reconciles that guess.
  const data: unknown = await res.json().catch(() => null);
  const echo = readDefaultName(data);
  return { supported: true, name: echo.present ? echo.name : name };
}
