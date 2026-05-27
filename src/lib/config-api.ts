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
