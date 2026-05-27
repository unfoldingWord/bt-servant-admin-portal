import { buildConfigUrl } from "@/lib/config-url";
import type { LanguageScaffold } from "@/types/language-scaffold";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export async function getLanguageScaffold(
  signal?: AbortSignal,
  org?: string | null
): Promise<LanguageScaffold> {
  const res = await fetch(
    buildConfigUrl("/api/config/language-scaffold", org),
    {
      headers: SAME_ORIGIN_HEADERS,
      signal,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to load language scaffold (${res.status}): ${body}`
    );
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Worker wraps as { org, scaffold }.
  if ("scaffold" in data && typeof data.scaffold === "object") {
    return data.scaffold as LanguageScaffold;
  }
  return data as unknown as LanguageScaffold;
}
