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

/**
 * Flatten untrusted server text to a single display line.
 *
 * Newlines, tabs and other control characters collapse to spaces so a value can
 * never span rows or smuggle invisible structure into a chip. `\p{Cc}` catches
 * C0/C1 controls and `\p{Cf}` the invisible formatting characters (zero-width
 * joiners, bidi overrides) that render as nothing while still consuming width.
 *
 * Exported because `serverName` is not the only untrusted string the response
 * carries — `error` is read straight into the map's screen-reader tree and node
 * tooltips, and wants exactly the same treatment.
 */
export function collapseDisplayText(text: string): string {
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
    const name = collapseDisplayText(server.serverName ?? "");
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
  return names.get(serverId) ?? collapseDisplayText(serverId);
}

/** A server attribution ready to render in a DOM chip. */
export interface ServerLabel {
  /**
   * The full resolved name — the visible text node. Rendering it whole is what
   * keeps a screen reader's announcement complete when CSS visually truncates
   * it.
   */
  full: string;
  /**
   * The machine id, when it differs from `full`; otherwise `null`. Callers put
   * it in an sr-only span INSIDE the labelled element rather than in an
   * `aria-label`: per HTML-AAM, `aria-label` on a generic element (a bare
   * `span`, or a `Badge` that renders one) is not reliably mapped to an
   * accessible name, whereas text content always is. The id was what these
   * badges showed before names landed, so it stays discoverable.
   */
  machineId: string | null;
  /** Mouse tooltip: the full name, plus the id when the two differ. */
  title: string;
}

/**
 * Resolve `serverId` to a renderable display label.
 *
 * Nothing is cut: callers pair `full` with a CSS `truncate` for the visual
 * bound, so sighted users get a bounded chip while the DOM — and therefore the
 * accessible name — keeps the whole string.
 */
export function resolveServerLabel(
  serverId: string,
  names: ServerNameMap
): ServerLabel {
  const full = resolveServerName(serverId, names);
  const id = collapseDisplayText(serverId);
  const differs = full !== id;
  return {
    full,
    machineId: differs ? id : null,
    title: differs ? `${full} (${id})` : full,
  };
}

/** A resource row's untrusted display fields, each flattened to one safe line. */
export interface ResourceItemDisplay {
  /**
   * Row title: the collapsed label, falling back to the collapsed name when
   * the label is absent or collapses to nothing. Never blank when `name` is
   * non-blank, so a whitespace-only label can't produce an empty-looking row.
   */
  title: string;
  /** The collapsed name. */
  name: string;
  /**
   * The collapsed name to show as a secondary code chip — only when a
   * DISTINCT label titles the row, so `label === name` doesn't print twice and
   * a label-less row doesn't repeat its own title. `null` otherwise.
   */
  secondaryName: string | null;
  /** Collapsed organization, or `null` when absent or blank after collapse. */
  organization: string | null;
  /** Collapsed version, or `null` when absent or blank after collapse. */
  version: string | null;
}

/**
 * Collapse a `ResourceItem`'s untrusted, MCP-relayed display fields (#294).
 *
 * Same class of text as `serverName` — third-party output relayed by the
 * worker, React-escaped, so the hazard is layout/legibility (embedded
 * newlines, zero-width and bidi characters), not injection. Each field is run
 * through `collapseDisplayText`; length is left to CSS at the render boundary,
 * matching how server labels are handled.
 */
export function resolveResourceItemDisplay(item: {
  name: string;
  label?: string;
  organization?: string;
  version?: string;
}): ResourceItemDisplay {
  const label = collapseDisplayText(item.label ?? "");
  const name = collapseDisplayText(item.name);
  const organization = item.organization
    ? collapseDisplayText(item.organization)
    : "";
  const version = item.version ? collapseDisplayText(item.version) : "";
  return {
    title: label || name,
    name,
    secondaryName: label && label !== name ? name : null,
    organization: organization || null,
    version: version || null,
  };
}
