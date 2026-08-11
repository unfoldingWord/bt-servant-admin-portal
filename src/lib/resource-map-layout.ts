// Pure layout engine for the MCP server map (#261) — turns the aggregated
// resources response (#230 / worker#257) into deterministic SVG geometry.
// Deliberately DOM-free: it runs (and is tested) under the workers-pool
// tsconfig, and the rendering component stays a thin projection of this
// output. No diagram library — the topology is small and fixed-shape
// (org → servers → subject leaves), so hand-rolled elbows beat a dependency.

import { buildServerNameMap, resolveServerName } from "@/lib/resource-servers";
import { subjectLabel } from "@/lib/resource-subjects";
import { truncateLabel } from "@/lib/truncate";
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

// The org name renders at fontSize 12.5 semibold, inset ORG_PAD_X from each
// side of the fixed-width org node. Same estimate-don't-measure approach as
// the leaf chips, inverted: the node width is fixed here, so the character
// budget is derived from it rather than the other way round.
const ORG_CHAR_W = 7.4;
const ORG_PAD_X = 14;
export const ORG_NAME_MAX_CHARS = Math.floor(
  (MAP.org.width - ORG_PAD_X * 2) / ORG_CHAR_W
);

// The caption renders at fontSize 10 inside the fixed-width server node,
// starting SERVER_TEXT_X in from its left edge (clearing the status dot) with
// a matching inset on the right. Derived from the node geometry exactly as
// ORG_NAME_MAX_CHARS is, and for the same reason: the caption is not free
// geometry. It carries either the degraded-status suffix or a user-typed
// content-language tag, and both run past the node's right edge unbounded.
const CAPTION_CHAR_W = 5.5;
const SERVER_TEXT_X = 26;
const SERVER_PAD_R = 12;
export const SERVER_CAPTION_MAX_CHARS = Math.floor(
  (MAP.server.width - SERVER_TEXT_X - SERVER_PAD_R) / CAPTION_CHAR_W
);

export interface ResourceMapLeaf {
  slug: string;
  /** Full subjectLabel — the <title> fallback when `label` was cut short. */
  fullLabel: string;
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
  /** Org identifier as the response gave it. */
  orgName: string;
  /** orgName pre-truncated for in-node rendering. */
  orgDisplayName: string;
  servers: ResourceMapServer[];
}

/** The two forms of a server-node caption. */
export interface ServerCaption {
  /** Untruncated — the sr-only tree and the node <title> carry this. */
  full: string;
  /** Bounded to SERVER_CAPTION_MAX_CHARS, for the SVG <text>. */
  display: string;
}

const EMPTY_CAPTION_PREFIX = "nothing listed for ";

function quoteLanguage(tag: string): string {
  return `${EMPTY_CAPTION_PREFIX}“${tag}”`;
}

/** What the tag itself may spend once the prose and quotes are paid for. */
const LANGUAGE_TAG_MAX_CHARS = Math.max(
  1,
  SERVER_CAPTION_MAX_CHARS - quoteLanguage("").length
);

function bounded(full: string): ServerCaption {
  return { full, display: truncateLabel(full, SERVER_CAPTION_MAX_CHARS) };
}

/**
 * Caption under a server node. Leaves are data-driven, so a degraded server
 * can still have items attributed to it (a cached listing behind a failed
 * refresh, say). Status alone would then read as "failed and empty" while
 * the map shows leaves and the totals count them — so the shown count is
 * appended to the reason rather than dropped.
 *
 * Neither long form fits the node unbounded: the degraded-with-count suffix
 * is fixed prose that simply runs long, and the content language is a free
 * IETF-code text field, so arbitrary user text lands inside the quotes. The
 * tag is cut before the sentence around it — truncating the whole caption
 * from the tail would eat the closing quote and the part that says what
 * happened. The full text survives on `full` either way.
 */
export function serverCaption(
  status: ResourceServerStatus,
  resourceCount: number,
  language: string
): ServerCaption {
  const counted = `${String(resourceCount)} ${
    resourceCount === 1 ? "resource" : "resources"
  }`;
  if (status !== "ok") {
    const reason =
      status === "unsupported" ? "no resource listing" : "failed to respond";
    return bounded(resourceCount > 0 ? `${reason} — ${counted} shown` : reason);
  }
  if (resourceCount === 0) {
    return {
      full: quoteLanguage(language),
      display: truncateLabel(
        quoteLanguage(truncateLabel(language, LANGUAGE_TAG_MAX_CHARS)),
        SERVER_CAPTION_MAX_CHARS
      ),
    };
  }
  return bounded(counted);
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
  // Same attribution join the list page and the priority panel use, so a
  // blank or whitespace-only serverName degrades to the server id here too
  // rather than labelling a node with an empty string, and untrusted control
  // characters are collapsed before they reach the sr-only tree or a <title>.
  const serverNames = buildServerNameMap(data.servers);

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
      const fullLabel = subjectLabel(entry.slug);
      const label = truncateLabel(fullLabel, LEAF_LABEL_MAX_CHARS);
      return {
        slug: entry.slug,
        fullLabel,
        label,
        count: entry.count,
        y: leavesTop + i * (MAP.leaf.height + MAP.leaf.gap),
        width: leafWidth(label, entry.count),
      };
    });

    y += height + MAP.blockGap;

    const resolvedName = resolveServerName(server.serverId, serverNames);

    return {
      serverId: server.serverId,
      serverName: resolvedName,
      displayName: truncateLabel(resolvedName, SERVER_NAME_MAX_CHARS),
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

  return {
    width: MAP.width,
    height,
    orgCenterY,
    orgName: data.org,
    orgDisplayName: truncateLabel(data.org, ORG_NAME_MAX_CHARS),
    servers,
  };
}
