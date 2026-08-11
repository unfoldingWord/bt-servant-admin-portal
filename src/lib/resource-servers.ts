// Server attribution for resources (#230 "indicate the source MCP server for
// each resource"). The aggregated response carries attribution as a machine id
// on every `ResourceItem` (`serverId`) and the human-readable name only once,
// in the `servers[]` status block (`serverName`) — so rendering a resource's
// source as a NAME is always a join, never a field read. This module owns that
// join, so the three surfaces built on the same response (list page, topology
// map, priority panel) resolve attribution one way rather than three.
//
// `serverName` is third-party MCP-server output relayed by the worker, i.e.
// untrusted display text. React escapes it, so the hazard here is layout and
// legibility rather than injection: an unbounded name blows out a badge row,
// and embedded newlines/control characters break a single-line chip. Both are
// neutralized on the way in (collapse) and on the way out (truncate).

import { truncateLabel } from "@/lib/resource-map-layout";
import type { ResourceServerReport } from "@/types/resources";

/**
 * Character budget for an inline server badge. Chosen to match the topology
 * map's in-node budget (`SERVER_NAME_MAX_CHARS`, 24) plus a little slack — the
 * badge is laid out by CSS rather than fitted into fixed SVG geometry, so it
 * can afford a few more characters without wrapping its row.
 */
export const RESOURCE_SERVER_LABEL_MAX_CHARS = 28;

/** serverId → human-readable serverName, blank and unusable names omitted. */
export type ServerNameMap = ReadonlyMap<string, string>;

// Untrusted text arrives as a single display line: newlines, tabs and other
// control characters collapse to spaces so a name can never span rows or smuggle
// invisible structure into a chip. `\p{Cc}` catches C0/C1 controls and
// `\p{Cf}` the invisible formatting characters (zero-width joiners, bidi
// overrides) that render as nothing while still consuming the budget.
function collapseWhitespace(text: string): string {
  return text.replace(/[\s\p{Cc}\p{Cf}]+/gu, " ").trim();
}

/**
 * Index the `servers[]` status block by id.
 *
 * A server whose name is blank (or collapses to nothing) is omitted rather than
 * indexed as `""` — an empty name is not an improvement on the id, and callers
 * fall back to the id for anything this map doesn't answer.
 */
export function buildServerNameMap(
  servers: readonly ResourceServerReport[]
): ServerNameMap {
  const names = new Map<string, string>();
  for (const server of servers) {
    const name = collapseWhitespace(server.serverName ?? "");
    if (name.length > 0) names.set(server.serverId, name);
  }
  return names;
}

/**
 * The best full-length human label for `serverId`.
 *
 * Falls back to the id itself when the server isn't in the status block — which
 * is off-contract but observable in practice (a server can list resources and
 * then drop out of a later aggregation), and showing the raw id beats showing
 * nothing about where a resource came from.
 */
export function resolveServerName(
  serverId: string,
  names: ServerNameMap
): string {
  return names.get(serverId) ?? collapseWhitespace(serverId);
}

/** A server attribution ready to render in a fixed-width chip. */
export interface ServerLabel {
  /** Full resolved name — never truncated. */
  full: string;
  /** `full` bounded to the character budget; what the chip renders. */
  display: string;
  /** True when `display` had to cut `full` short. */
  truncated: boolean;
  /**
   * Tooltip text. Always the full name, and additionally the machine id when
   * the two differ — the id was what this badge showed before names landed, and
   * it stays discoverable rather than being replaced outright.
   */
  title: string;
}

/**
 * Resolve `serverId` to a bounded, tooltip-annotated display label.
 *
 * Truncation is by character count (the same mechanism the topology map uses)
 * rather than CSS: it bounds the string itself, so it holds in a tooltip, an
 * accessible name, and any container the badge is dropped into.
 */
export function resolveServerLabel(
  serverId: string,
  names: ServerNameMap,
  max: number = RESOURCE_SERVER_LABEL_MAX_CHARS
): ServerLabel {
  const full = resolveServerName(serverId, names);
  const display = truncateLabel(full, max);
  const id = collapseWhitespace(serverId);
  return {
    full,
    display,
    truncated: display !== full,
    title: full === id ? full : `${full} (${id})`,
  };
}
