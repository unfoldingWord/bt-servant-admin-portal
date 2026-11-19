import type { ApiKey } from "@/types/api-keys";

// Display rules for the API keys page (#354), kept pure so they're testable.

const DATE_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const DATE_TIME_FMT = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Nov 13, 2026", or null for an absent or unparseable value. */
export function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : DATE_FMT.format(t);
}

/** "Nov 13, 2026, 3:04 PM", or null for an absent or unparseable value. */
export function formatDateTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : DATE_TIME_FMT.format(t);
}

/**
 * "Last used" cell text. The worker may not record it yet (older worker) or
 * the key may never have been used; both read "Not yet recorded".
 */
export function lastUsedLabel(key: Pick<ApiKey, "lastUsedAt">): string {
  return formatDateTime(key.lastUsedAt) ?? "Not yet recorded";
}

export type KeyStateTone = "active" | "grace" | "inactive";

/**
 * The status badge: an active key in its rotation grace window is shown
 * as ending, so nobody mistakes it for a key that keeps working.
 */
export function keyState(key: Pick<ApiKey, "status" | "expiresAt">): {
  label: string;
  tone: KeyStateTone;
} {
  if (key.status === "revoked") return { label: "Revoked", tone: "inactive" };
  if (key.status === "expired") return { label: "Expired", tone: "inactive" };
  const ends = formatDate(key.expiresAt);
  if (ends) return { label: `Ends ${ends}`, tone: "grace" };
  return { label: "Active", tone: "active" };
}

/** Active keys first, then newest first. */
export function sortKeys<T extends Pick<ApiKey, "status" | "createdAt">>(
  keys: readonly T[]
): T[] {
  return [...keys].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  });
}
