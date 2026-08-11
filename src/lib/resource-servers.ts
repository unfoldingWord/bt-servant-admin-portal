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
// legibility rather than injection: embedded newlines and control characters
// break a single-line chip, so they are collapsed on the way in.
//
// This resolution is DISPLAY-ONLY. It deliberately has no consumer on the
// path that emits text into a mode document (lib/resource-priority), which
// keeps its own raw join so that generated prompt bytes stay stable — see the
// note above `buildPriorityEntries`. Hardening a rendered badge must never be
// able to author a document revision.
//
// Length is NOT bounded here. DOM surfaces render the full name and let CSS
// (`truncate`) do the visual cut, so the accessible name stays complete; only
// the SVG map, where CSS cannot reach, cuts the string itself via
// lib/truncate.

import type { ResourceServerReport } from "@/types/resources";

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

/** A server attribution ready to render in a DOM chip. */
export interface ServerLabel {
  /**
   * The full resolved name — the text node. Rendering it whole is what keeps a
   * screen reader's announcement complete when CSS visually truncates it.
   */
  full: string;
  /**
   * Tooltip and accessible name. Always the full name, and additionally the
   * machine id when the two differ — the id was what these badges showed
   * before names landed, and it stays discoverable rather than being replaced
   * outright.
   */
  title: string;
}

/**
 * Resolve `serverId` to a renderable display label.
 *
 * Nothing is cut: callers pair `full` with a CSS `truncate` for the visual
 * bound and pass `title` to both `title` and `aria-label`, so sighted users get
 * a bounded chip and assistive tech gets the whole name plus the id.
 */
export function resolveServerLabel(
  serverId: string,
  names: ServerNameMap
): ServerLabel {
  const full = resolveServerName(serverId, names);
  const id = collapseWhitespace(serverId);
  return { full, title: full === id ? full : `${full} (${id})` };
}
