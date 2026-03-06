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

export async function getOrgOverrides(
  signal?: AbortSignal
): Promise<PromptOverrides> {
  const res = await fetch("/api/config/prompt-overrides", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load overrides (${res.status}): ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  console.log(
    "[config-api] getOrgOverrides raw response:",
    JSON.stringify(data)
  );

  // Engine API may wrap overrides in { prompt_overrides: {...} } or { org, overrides: {...} }
  let result: PromptOverrides;
  if ("prompt_overrides" in data && typeof data.prompt_overrides === "object") {
    result = data.prompt_overrides as PromptOverrides;
  } else if ("overrides" in data && typeof data.overrides === "object") {
    result = data.overrides as PromptOverrides;
  } else {
    result = data as unknown as PromptOverrides;
  }

  console.log(
    "[config-api] getOrgOverrides unwrapped:",
    JSON.stringify(result)
  );
  return result;
}

export async function putOrgOverrides(
  overrides: PromptOverrides,
  signal?: AbortSignal
): Promise<PromptOverrides> {
  const res = await fetch("/api/config/prompt-overrides", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(overrides),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to save overrides (${res.status}): ${body}`);
  }

  return (await res.json()) as PromptOverrides;
}

export async function deleteOrgOverrides(signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/config/prompt-overrides", {
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

export async function listModes(signal?: AbortSignal): Promise<OrgModes> {
  const res = await fetch("/api/config/modes", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load modes (${res.status}): ${body}`);
  }

  return (await res.json()) as OrgModes;
}

export async function getMode(
  name: string,
  signal?: AbortSignal
): Promise<PromptMode> {
  const res = await fetch(`/api/config/modes/${encodeURIComponent(name)}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load mode (${res.status}): ${body}`);
  }

  const modeData = (await res.json()) as PromptMode;
  console.log("[config-api] getMode raw response:", JSON.stringify(modeData));
  return modeData;
}

export async function putMode(
  name: string,
  body: { label?: string; description?: string; overrides: PromptOverrides },
  signal?: AbortSignal
): Promise<PromptMode> {
  const res = await fetch(`/api/config/modes/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to save mode (${res.status}): ${text}`);
  }

  return (await res.json()) as PromptMode;
}

export async function deleteMode(
  name: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/config/modes/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete mode (${res.status}): ${body}`);
  }
}

export async function setDefaultMode(
  mode: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/config/modes-default", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ mode }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to set default mode (${res.status}): ${body}`);
  }
}

export async function clearDefaultMode(signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/config/modes-default", {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to clear default mode (${res.status}): ${body}`);
  }
}
