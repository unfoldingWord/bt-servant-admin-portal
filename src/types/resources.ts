// Mirrors bt-servant-worker's aggregated-resources contract verbatim
// (worker#257 item 1, final TS types posted 2026-07-30; design locked on
// portal#230 Q4–Q6). Do not add portal-side fields here — the worker owns
// this shape, and drift is exactly what mirroring is meant to prevent.

/** GET /api/config/resources?language=xx (IETF-style, e.g. "en", "sw", "es-419") */
export interface AggregatedResourcesResponse {
  org: string;
  language: string;
  resources: ResourcesBySubject;
  servers: ResourceServerReport[];
}

/**
 * Grouped by canonical subject slug. Within a subject: server-default order,
 * servers concatenated in ascending `priority` order (same comparator as the
 * worker's chat path).
 */
export type ResourcesBySubject = Record<string, ResourceItem[]>;

export interface ResourceItem {
  /** Server-scoped identifier (e.g. "en_ult", "BiblicaStudyNotes"). */
  name: string;
  /** Canonical subject slug — an OPEN set; unmapped server vocabulary is
      slugified by the worker rather than dropped, so unknown slugs must
      render, not error (see subjectLabel in lib/resource-subjects). */
  subject: string;
  /** Attribution: MCPServerConfig.id of the server that listed this item. */
  serverId: string;
  /** Human-readable title, when it differs from name (aquifer). */
  label?: string;
  organization?: string;
  version?: string;
  url?: string;
  /** Where the server exposes a count (aquifer). */
  articleCount?: number;
}

export type ResourceServerStatus = "ok" | "unsupported" | "error";

export interface ResourceServerReport {
  serverId: string;
  serverName: string;
  /** unsupported = no listing tool (FIA); error = transient, retryable. */
  status: ResourceServerStatus;
  /** Present iff status === "error". */
  error?: string;
}

// Display labels for the canonical subject slugs the worker normalizes to.
// Mirrors the worker's SUBJECT_LABELS map (worker#257). The set is open —
// anything not listed here gets a humanized fallback, never dropped.
export const KNOWN_SUBJECT_LABELS: Record<string, string> = {
  bible: "Bible Translations",
  "aligned-bible": "Aligned Bibles",
  "bible-stories": "Bible Stories",
  dictionary: "Dictionaries",
  media: "Images, Maps & Videos",
  "study-notes": "Study Notes",
  "translation-academy": "Translation Academy",
  "translation-notes": "Translation Notes",
  "translation-questions": "Translation Questions",
  "translation-words": "Translation Words",
  "translation-words-links": "Translation Words Links",
};
