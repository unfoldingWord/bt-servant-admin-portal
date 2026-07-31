// Pure layout engine for the MCP server map (#261) — turns the aggregated
// resources response (#230 / worker#257) into deterministic SVG geometry.
// Deliberately DOM-free: it runs (and is tested) under the workers-pool
// tsconfig, and the rendering component stays a thin projection of this
// output. No diagram library — the topology is small and fixed-shape
// (org → servers → subject leaves), so hand-rolled elbows beat a dependency.

import { subjectLabel } from "@/lib/resource-subjects";
import type {
  AggregatedResourcesResponse,
  ResourceServerStatus,
} from "@/types/resources";

// All coordinates are in SVG user units within a fixed-width viewport; the
// container scrolls horizontally below MAP.width rather than reflowing.
export const MAP = {
  width: 920,
  padY: 28,
  org: { x: 16, width: 156, height: 58 },
  /** Vertical trunk the org feeds; server branches tee off it. */
  spineX: 204,
  server: { x: 236, width: 204, height: 54 },
  /** Vertical mini-spine between a server and its subject leaves. */
  leafSpineX: 464,
  leaf: { x: 488, height: 26, gap: 10 },
  blockGap: 30,
} as const;

// Approximate glyph advance at the map's 11px label size. SVG text has no
// CSS-driven truncation, so chip widths are estimated, not measured — the
// generous padding absorbs the variance of a proportional face.
const LEAF_CHAR_W = 6.0;
const COUNT_CHAR_W = 6.6;
const LEAF_PAD_X = 12;
const LEAF_COUNT_GAP = 10;
const MAX_LEAF_WIDTH = MAP.width - MAP.leaf.x - 16;
const LEAF_LABEL_MAX_CHARS = 30;
export const SERVER_NAME_MAX_CHARS = 24;

export interface ResourceMapLeaf {
  slug: string;
  /** Display label (subjectLabel), pre-truncated to fit the chip. */
  label: string;
  count: number;
  /** Top edge of the chip. */
  y: number;
  width: number;
}

export interface ResourceMapServer {
  serverId: string;
  serverName: string;
  /** serverName pre-truncated for in-node rendering. */
  displayName: string;
  status: ResourceServerStatus;
  error?: string;
  /** Top edge of this server's block (node + leaves). */
  top: number;
  /** Height of the block: max(node height, leaves span). */
  height: number;
  /** Vertical center of the server node — branch lines land here. */
  centerY: number;
  /** Total resources this server contributed across all subjects. */
  resourceCount: number;
  leaves: ResourceMapLeaf[];
}

export interface ResourceMapLayout {
  width: number;
  height: number;
  orgCenterY: number;
  servers: ResourceMapServer[];
}

/** Ellipsis-truncate to at most `max` characters (including the ellipsis). */
export function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function leafWidth(label: string, count: number): number {
  const raw =
    LEAF_PAD_X * 2 +
    label.length * LEAF_CHAR_W +
    LEAF_COUNT_GAP +
    String(count).length * COUNT_CHAR_W;
  return Math.min(Math.ceil(raw), MAX_LEAF_WIDTH);
}

/**
 * Compute the full map geometry. Leaves are data-driven: a server gets a
 * subject leaf iff items are actually attributed to it (serverId match),
 * independent of its status block — so the map can never claim resources a
 * server didn't list, and never hides ones it did. Subject order follows the
 * response's own key order; server order is the worker's server-default
 * order. Both orderings are contract, not portal opinion (#230 Q5).
 */
export function buildResourceMapLayout(
  data: AggregatedResourcesResponse
): ResourceMapLayout {
  const subjectEntries = Object.entries(data.resources);

  let y = MAP.padY;
  const servers: ResourceMapServer[] = data.servers.map((server) => {
    const counted = subjectEntries
      .map(([slug, items]) => ({
        slug,
        count: items.filter((item) => item.serverId === server.serverId).length,
      }))
      .filter((entry) => entry.count > 0);

    const leavesSpan =
      counted.length > 0
        ? counted.length * MAP.leaf.height + (counted.length - 1) * MAP.leaf.gap
        : 0;
    const height = Math.max(MAP.server.height, leavesSpan);
    const top = y;
    const leavesTop = top + (height - leavesSpan) / 2;

    const leaves: ResourceMapLeaf[] = counted.map((entry, i) => {
      const label = truncateLabel(
        subjectLabel(entry.slug),
        LEAF_LABEL_MAX_CHARS
      );
      return {
        slug: entry.slug,
        label,
        count: entry.count,
        y: leavesTop + i * (MAP.leaf.height + MAP.leaf.gap),
        width: leafWidth(label, entry.count),
      };
    });

    y += height + MAP.blockGap;

    return {
      serverId: server.serverId,
      serverName: server.serverName,
      displayName: truncateLabel(server.serverName, SERVER_NAME_MAX_CHARS),
      status: server.status,
      error: server.error,
      top,
      height,
      centerY: top + height / 2,
      resourceCount: counted.reduce((sum, entry) => sum + entry.count, 0),
      leaves,
    };
  });

  if (servers.length > 0) y -= MAP.blockGap;
  else y += MAP.org.height;

  const firstServer = servers[0];
  const lastServer = servers[servers.length - 1];
  const orgCenterY =
    firstServer && lastServer
      ? (firstServer.centerY + lastServer.centerY) / 2
      : MAP.padY + MAP.org.height / 2;

  // The org node may extend past a short server column (e.g. one leafless
  // server) — the viewport must contain it either way.
  const height = Math.max(y, orgCenterY + MAP.org.height / 2) + MAP.padY;

  return { width: MAP.width, height, orgCenterY, servers };
}
