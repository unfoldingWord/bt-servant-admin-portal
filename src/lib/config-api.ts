import { buildConfigUrl } from "@/lib/config-url";
import type { MemoryResponse } from "@/types/memory";
import type {
  OrgModes,
  PromptMode,
  PromptOverrides,
} from "@/types/prompt-override";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

// ---------------------------------------------------------------------------
// Org-level prompt overrides
// ---------------------------------------------------------------------------

function unwrapOverridesResponse(
  data: Record<string, unknown>
): PromptOverrides {
  // Engine wraps the overrides in `{ prompt_overrides: {...} }` or
  // `{ org, overrides: {...}, message? }`. GET has always unwrapped these;
  // PUT used to cast the envelope directly, which left callers reading
  // `result.identity` as undefined — same class of bug as the `putLanguage`
  // / `putMode` envelope fixes from #106 / #110.
  if ("prompt_overrides" in data && typeof data.prompt_overrides === "object") {
    return data.prompt_overrides as PromptOverrides;
  }
  if ("overrides" in data && typeof data.overrides === "object") {
    return data.overrides as PromptOverrides;
  }
  return data as unknown as PromptOverrides;
}

export async function getOrgOverrides(
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptOverrides> {
  const res = await fetch(buildConfigUrl("/api/config/prompt-overrides", org), {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load overrides (${res.status}): ${body}`);
  }

  return unwrapOverridesResponse((await res.json()) as Record<string, unknown>);
}

export async function putOrgOverrides(
  overrides: PromptOverrides,
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptOverrides> {
  const res = await fetch(buildConfigUrl("/api/config/prompt-overrides", org), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(overrides),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to save overrides (${res.status}): ${body}`);
  }

  return unwrapOverridesResponse((await res.json()) as Record<string, unknown>);
}

export async function deleteOrgOverrides(
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const res = await fetch(buildConfigUrl("/api/config/prompt-overrides", org), {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete overrides (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export async function listModes(
  signal?: AbortSignal,
  org?: string | null
): Promise<OrgModes> {
  const res = await fetch(buildConfigUrl("/api/config/modes", org), {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load modes (${res.status}): ${body}`);
  }

  return (await res.json()) as OrgModes;
}

function unwrapModeResponse(data: Record<string, unknown>): PromptMode {
  // Worker wraps in `{ org, mode: { name, label?, description?, published?,
  // document, format, originalSlots? }, message? }`. We ignore `format` and
  // `originalSlots` — both are diagnostic only and not part of the portal's
  // contract.
  if ("mode" in data && typeof data.mode === "object" && data.mode !== null) {
    return data.mode as PromptMode;
  }
  return data as unknown as PromptMode;
}

export async function getMode(
  name: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptMode> {
  const res = await fetch(
    buildConfigUrl(`/api/config/modes/${encodeURIComponent(name)}`, org),
    {
      headers: SAME_ORIGIN_HEADERS,
      signal,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load mode (${res.status}): ${body}`);
  }

  return unwrapModeResponse((await res.json()) as Record<string, unknown>);
}

export async function putMode(
  name: string,
  body: {
    label?: string;
    description?: string;
    document: string;
    published?: boolean;
  },
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptMode> {
  const res = await fetch(
    buildConfigUrl(`/api/config/modes/${encodeURIComponent(name)}`, org),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save mode (${res.status}): ${text}`);
  }

  // Unwrap `{ org, mode, message }` envelope — same shape as `putLanguage`.
  // The pre-#213 cast-as-`PromptMode` had a latent bug where `result.name`
  // was undefined on the wrapped response.
  return unwrapModeResponse((await res.json()) as Record<string, unknown>);
}

export async function deleteMode(
  name: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const res = await fetch(
    buildConfigUrl(`/api/config/modes/${encodeURIComponent(name)}`, org),
    {
      method: "DELETE",
      headers: SAME_ORIGIN_HEADERS,
      signal,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete mode (${res.status}): ${body}`);
  }
}

// Engine mode-op endpoints (`_rename`) reject with a JSON `{ error }` body
// (validation 400 / not-found 404 / slug-collision 409). Surface that
// message rather than the raw `{"error":"…"}` blob so the rename dialog can
// show e.g. "Mode 'x' already exists" inline. Falls back to plain text for
// non-JSON error bodies.
async function readModeOpError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Body wasn't JSON — fall through to the raw text.
  }
  return text;
}

// Reslug a mode in place via the engine's `_rename` op (#232). The engine
// preserves the old slug as an alias so users already assigned to the mode
// keep resolving — no one is stranded in "no mode". Returns the renamed
// mode (new canonical `name`). The worker BFF gates this on edit+publish.
export async function renameMode(
  name: string,
  newName: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptMode> {
  const res = await fetch(
    buildConfigUrl(
      `/api/config/modes/${encodeURIComponent(name)}/_rename`,
      org
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
      body: JSON.stringify({ newName }),
      signal,
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to rename mode (${res.status}): ${await readModeOpError(res)}`
    );
  }

  // Same `{ org, mode, message }` envelope as putMode/getMode.
  return unwrapModeResponse((await res.json()) as Record<string, unknown>);
}

// Clone a mode via the engine's `_clone` op (#232 / #241 PR B). The engine
// creates a new mode with the given slug (+ optional label); document is
// copied verbatim from the source and `published` is reset to false so the
// clone lands as a draft. Rejects with 409 if the new slug collides with any
// existing mode's canonical name OR alias in the org (Ian's #232
// reconciliation §4).
//
// #257 — a clone performed by a non-admin shepherd comes back flagged
// (X-Bootstrap-Grant header) with the VERBS the caller now holds on the
// new slug (e.g. "edit" or "edit,publish"); the client mirrors exactly
// those into its session user. An explicit wire signal, NOT client-side
// inference — same rationale as the #247 language-create grant (#256
// rds 2–3; the verb list replaced a client-side recomputation in #258
// rd-2).
export interface CloneGrantedVerbs {
  edit: boolean;
  publish: boolean;
}

export interface CloneModeResult extends PromptMode {
  grantedVerbs: CloneGrantedVerbs | null;
}

// A 409 slug collision. When a prior clone attempt COMMITTED on the
// engine but its response was lost, the kept auto-grant makes the
// retry collide here — `grantedVerbs` (from the same header, attached
// to the 409) carries the rights the caller's live session holds on
// the colliding slug so the UI can reconcile instead of stranding an
// invisible, uneditable mode (#258 rd-2 P2).
export class CloneCollisionError extends Error {
  constructor(
    message: string,
    readonly grantedVerbs: CloneGrantedVerbs | null
  ) {
    super(message);
    this.name = "CloneCollisionError";
  }
}

function parseGrantedVerbs(res: Response): CloneGrantedVerbs | null {
  const header = res.headers.get("X-Bootstrap-Grant");
  if (!header) return null;
  const verbs = header.split(",");
  return { edit: verbs.includes("edit"), publish: verbs.includes("publish") };
}

export async function cloneMode(
  name: string,
  body: { newName: string; newLabel?: string },
  signal?: AbortSignal,
  org?: string | null
): Promise<CloneModeResult> {
  const res = await fetch(
    buildConfigUrl(`/api/config/modes/${encodeURIComponent(name)}/_clone`, org),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!res.ok) {
    const message = `Failed to clone mode (${res.status}): ${await readModeOpError(res)}`;
    if (res.status === 409) {
      throw new CloneCollisionError(message, parseGrantedVerbs(res));
    }
    throw new Error(message);
  }

  return {
    ...unwrapModeResponse((await res.json()) as Record<string, unknown>),
    grantedVerbs: parseGrantedVerbs(res),
  };
}

// Retire the source mode and forward users onto `forwardTo` via the
// engine's `_retire` op (#232 / #241 PR C). The engine moves the
// source's canonical slug AND its own existing aliases onto the
// target's aliases array (Ian's #232 reconciliation §3), then deletes
// the source. Returns the TARGET mode (widened aliases). Rejects with
// 400 (retire-to-self, missing body), 404 (missing source or missing
// `forwardTo` target).
export async function retireMode(
  name: string,
  forwardTo: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<PromptMode> {
  const res = await fetch(
    buildConfigUrl(
      `/api/config/modes/${encodeURIComponent(name)}/_retire`,
      org
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
      body: JSON.stringify({ forwardTo }),
      signal,
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to retire mode (${res.status}): ${await readModeOpError(res)}`
    );
  }

  return unwrapModeResponse((await res.json()) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Per-user memory
// ---------------------------------------------------------------------------

export async function getUserMemory(
  userId: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<MemoryResponse> {
  const url = buildConfigUrl(
    `/api/config/user-memory/${encodeURIComponent(userId)}`,
    org
  );
  const res = await fetch(url, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load user memory (${res.status}): ${body}`);
  }

  return (await res.json()) as MemoryResponse;
}

export async function deleteUserMemory(
  userId: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const url = buildConfigUrl(
    `/api/config/user-memory/${encodeURIComponent(userId)}`,
    org
  );
  const res = await fetch(url, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete user memory (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Per-user mode
// ---------------------------------------------------------------------------

export async function setUserMode(
  userId: string,
  mode: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const url = buildConfigUrl(
    `/api/config/user-mode/${encodeURIComponent(userId)}`,
    org
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ mode }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to set user mode (${res.status}): ${body}`);
  }
}

export async function clearUserMode(
  userId: string,
  signal?: AbortSignal,
  org?: string | null
): Promise<void> {
  const url = buildConfigUrl(
    `/api/config/user-mode/${encodeURIComponent(userId)}`,
    org
  );
  const res = await fetch(url, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to clear user mode (${res.status}): ${body}`);
  }
}
