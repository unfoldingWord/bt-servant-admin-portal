// Per-mode resource prioritization (#277) — the ordering is persisted as a
// generated, delimited markdown block spliced into the tail of the mode
// document's `## Tool Guidance` section. The document IS the storage AND the
// injection: the worker's `parseModeDocument` splits only on the seven exact
// H2 slot labels, so a `### Resource priorities` sub-heading rides inside the
// `tool_guidance` slot verbatim, and `buildSystemPrompt` places that slot
// immediately before the MCP tool catalog — where tool-selection guidance
// belongs. A structured `resourcePriority` field would be dropped by the
// worker's `mergeExistingMode` whitelist, so this is the only zero-worker-
// change path.
//
// Everything here is pure and DOM-free: it runs (and is tested) under the
// workers-pool tsconfig, and the panel component is a thin projection of it.

import { subjectLabel } from "@/lib/resource-subjects";
import type { PromptSlot } from "@/types/prompt-override";
import { PROMPT_SLOTS, SLOT_LABELS } from "@/types/prompt-override";
import type {
  AggregatedResourcesResponse,
  ResourceItem,
} from "@/types/resources";

/** Opening marker of the generated block. Exact string — parse-back keys on it. */
export const RESOURCE_PRIORITY_BEGIN = "<!-- bt:resource-priorities -->";
/** Closing marker of the generated block. */
export const RESOURCE_PRIORITY_END = "<!-- /bt:resource-priorities -->";

/** Worker `MAX_MODE_DOCUMENT_LENGTH` — the whole document, block included. */
export const MAX_MODE_DOCUMENT_LENGTH = 64000;

const PRIORITY_BLOCK_HEADING = "### Resource priorities";

// Wrapped exactly as the spec's block format shows it. The wrap points are
// part of the generated text, so a regenerated block is byte-identical to the
// one already in the document when nothing changed — which is what makes the
// splice idempotent.
const PRIORITY_BLOCK_PROSE = [
  "When answering from resources, strongly prefer the sources below, in this order. Answer from the",
  "highest-ranked source that covers the question; fall back to the next-ranked source only when the",
  "higher one does not cover it. Use unranked resources only when none of the ranked sources apply.",
].join("\n");

const MISSING_FROM_LIVE_SUFFIX = "not currently listed";

// The machine-readable half of the block. The prose list is disposable — this
// line is the only thing parse-back reads. Emission is always a single line,
// so the parse is line-anchored with a GREEDY capture to the line's last `]`:
// a lazy match would stop at the first `]` inside an id (JSON.stringify emits
// `["aquifer:Notes]"]` for an id containing one) and misreport a well-formed
// block as corrupt — inviting the user to "repair" away a healthy ranking.
const ORDER_COMMENT_RE = /^<!--\s*order:\s*(\[.*\])\s*-->[ \t\r]*$/m;

/** One live resource, flattened out of the aggregated by-subject response. */
export interface PriorityEntry {
  /** Composite, and stable across languages: `"${serverId}:${name}"`. */
  id: string;
  /** `label ?? name` — what a human recognizes the resource by. */
  label: string;
  /**
   * Attribution id, carried so the panel can run its own DISPLAY-side join
   * (lib/resource-servers) without re-deriving it from the `serverId:name`
   * composite — which would misparse any resource name containing a colon.
   */
  serverId: string;
  /** RAW name from the status block — emission input. See the note below. */
  serverName: string;
  /** Display form of the (open-set) subject slug. */
  subjectLabelText: string;
}

/**
 * A row of the working order: a live entry, or a stored id the current
 * aggregation no longer lists. Stored order is intent, not a snapshot, so
 * `missing` rows are kept, badged, and still emitted into the block.
 */
export interface MergedEntry extends PriorityEntry {
  missing: boolean;
}

/** Composite identity — already the React key on the Resources page. */
export function resourceEntryId(item: ResourceItem): string {
  return `${item.serverId}:${item.name}`;
}

// How many times sanitization re-runs before giving up (see below).
const SANITIZE_PASS_LIMIT = 16;

/**
 * Make server- and user-authored text safe to interpolate into the block.
 *
 * The block lands in a slot the worker rewrites at prompt time, and four of
 * those rewrites can be triggered by ordinary-looking text:
 *   - Ulysses stripping — `%%` truncates the rest of its line and a matched
 *     `++…++` pair is deleted; either one can silently eat the ranked list.
 *   - Template substitution rewrites `{{word}}` sequences.
 *   - A line beginning `## ` is a slot boundary for `parseModeDocument`, so
 *     interpolated text must never be able to open one.
 *   - `<!--` and `-->` are THIS module's own delimiters, and labels, server
 *     names and subject labels are untrusted MCP-server output. A resource
 *     labelled `<!-- /bt:resource-priorities -->` would close the block early:
 *     the next apply would rewrite only the truncated span and strand the
 *     tail in the document, and no UI affordance could ever remove it again.
 *     `isEmittableId` already guards the machine-readable half of the block
 *     against exactly this; sanitization is the same guard for the prose half.
 *
 * Newlines collapse first, which is what reduces the third hazard to a
 * start-of-string check.
 */
export function sanitizePromptText(text: string): string {
  let out = text.replace(/[\r\n]+/g, " ");

  // Removals can splice new tokens together ("%+++%" → "%%", "<!<!---->->" →
  // "<!--"), and separating a brace pair can leave a fresh one behind ("{{{" →
  // "{ {{"), so run to a fixed point rather than a single pass. Each removal
  // consumes at least two characters permanently, so this terminates; the cap
  // is belt-and-braces.
  for (let pass = 0; pass < SANITIZE_PASS_LIMIT; pass += 1) {
    const next = out
      .replace(/%%/g, "")
      .replace(/\+\+/g, "")
      .replace(/<!--/g, "")
      .replace(/-->/g, "")
      .replace(/\{\{/g, "{ {");
    if (next === out) break;
    out = next;
  }

  // Leading hashes are dropped rather than escaped: a `\#\#` escape renders
  // literally in the prompt, and the heading text is the part worth keeping.
  return out.replace(/^\s*#+\s*/, "").trim();
}

/**
 * Flatten the aggregated response into server-default order — the response's
 * own subject-key order, and within a subject the worker's ascending-priority
 * server concatenation. Both orderings are contract, not portal opinion (#230
 * Q5), so iteration order is preserved verbatim and nothing is re-sorted.
 *
 * A resource is identified by `serverId:name`; the first occurrence wins if
 * the same id somehow surfaces under two subjects, so ids stay unique keys.
 */
export function buildPriorityEntries(
  response: AggregatedResourcesResponse
): PriorityEntry[] {
  // A RAW join, deliberately not the display resolution in lib/resource-servers
  // — including its `?? ` (not `||`) fallback, which leaves a blank serverName
  // as the empty string rather than substituting the id.
  //
  // This value reaches the mode document through `describeEntry`, and Apply
  // PUTs the WHOLE document (see handleApplyResourcePriorities in
  // app/pages/modes.tsx). So any change to these bytes would make the
  // regenerated block differ from the stored one for existing documents,
  // enabling Apply with no ranking intent behind it: a user opening the panel
  // to look would be offered a save that silently rewrites names — and carries
  // any unrelated unsaved draft edits along with it — while the blocked-state
  // copy still talks only about the ORDER. Emission is therefore frozen, and
  // display hardening is kept strictly on the display side. The round-trip test
  // in tests/resource-priority.test.ts holds this without an intervening apply.
  //
  // Emission-side safety is `sanitizePromptText` in `describeEntry`, which is
  // what neutralizes newlines and the worker's rewrite markers.
  const serverNames = new Map(
    response.servers.map((server) => [server.serverId, server.serverName])
  );
  const entries: PriorityEntry[] = [];
  const seen = new Set<string>();

  for (const [slug, items] of Object.entries(response.resources)) {
    for (const item of items) {
      const id = resourceEntryId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id,
        label: item.label ?? item.name,
        serverId: item.serverId,
        serverName: serverNames.get(item.serverId) ?? item.serverId,
        subjectLabelText: subjectLabel(slug),
      });
    }
  }

  return entries;
}

/** The two halves of the working list — see `mergeOrderWithLive`. */
export interface MergedOrder {
  /**
   * The ranking itself, in stored sequence: exactly the ids the order names,
   * and nothing else. This is what gets emitted, so it stays sparse.
   */
  ranked: MergedEntry[];
  /**
   * Live resources the order doesn't mention, in server-default order. They
   * are candidates, not ranking members: leaving a resource here is how a user
   * says "no preference", which is what makes the block's own "use unranked
   * resources only when none of the ranked sources apply" sentence mean
   * something.
   */
  unranked: MergedEntry[];
  /** `ranked` then `unranked` — the rendered list, top to bottom. */
  entries: MergedEntry[];
}

/**
 * Reconcile the stored order (intent) with the live aggregation (fact).
 *
 * Stored ids come first, in their stored sequence — including ids the current
 * language or aggregation no longer lists, which are flagged `missing` rather
 * than dropped, so a transient server outage or a language switch can't
 * quietly erase someone's ranking. Live resources the order doesn't mention
 * append at the bottom in server-default order (#277 decision 4).
 *
 * `recoveredDescriptions` (see `parsePriorityDescriptions`) gives a missing
 * row the description it last carried in the document, so the panel can show
 * "Swahili Literal Text — uW (Bible Translations)" instead of a raw id.
 *
 * The two halves are returned separately because the split is load-bearing:
 * the stored order is INTENT, a sparse list of the resources someone actually
 * ranked, so only `ranked` may be written back into the document. Emitting the
 * union would freeze the whole catalog into the prompt on the first Apply and
 * grow it again every time another language is enumerated.
 */
export function mergeOrderWithLive(
  storedOrder: string[],
  live: PriorityEntry[],
  recoveredDescriptions?: Map<string, string>
): MergedOrder {
  const liveById = new Map(live.map((entry) => [entry.id, entry]));
  const ranked: MergedEntry[] = [];
  const unranked: MergedEntry[] = [];
  const placed = new Set<string>();

  for (const id of storedOrder) {
    if (placed.has(id)) continue;
    placed.add(id);
    const entry = liveById.get(id);
    ranked.push(
      entry
        ? { ...entry, missing: false }
        : {
            id,
            // A resource nobody is listing keeps the description it last
            // carried in the document; only an id the document never
            // described renders raw.
            label: recoveredDescriptions?.get(id) ?? id,
            // No live report to attribute to. The row renders its own
            // "kept from the saved order" line instead of an attribution, so
            // there is nothing to resolve and nothing to guess at.
            serverId: "",
            serverName: "",
            subjectLabelText: "",
            missing: true,
          }
    );
  }

  for (const entry of live) {
    if (placed.has(entry.id)) continue;
    placed.add(entry.id);
    unranked.push({ ...entry, missing: false });
  }

  return { ranked, unranked, entries: [...ranked, ...unranked] };
}

// An id has to survive a round trip through an HTML comment: `-->` would end
// the comment early and a newline would break the single-line parse, so such
// an id is dropped rather than allowed to corrupt the block. No real server id
// or resource name contains either.
function isEmittableId(id: string): boolean {
  return id.length > 0 && !id.includes("-->") && !/[\r\n]/.test(id);
}

function describeEntry(entry: PriorityEntry): string {
  const label = sanitizePromptText(entry.label);
  const server = sanitizePromptText(entry.serverName);
  const subject = sanitizePromptText(entry.subjectLabelText);
  const attribution = [server, subject && `(${subject})`]
    .filter((part) => part.length > 0)
    .join(" ");
  return attribution ? `${label} — ${attribution}` : label;
}

/**
 * Render the block for `orderedIds`. The prose list is regenerated from live
 * data on every apply — only the `<!-- order: [...] -->` line is authoritative,
 * so a hand-edit to the interior is overwritten by design.
 *
 * An id the live lookup can't resolve keeps the description it already has in
 * the document (`recoveredDescriptions`, from `parsePriorityDescriptions`).
 * That matters twice over: the prompt keeps saying "Swahili Literal Text — uW"
 * instead of degrading to a raw id when the panel is enumerating some other
 * language (or a server is down), and the regenerated block stays
 * byte-identical to the stored one in that situation — which is what keeps
 * Apply honestly disabled when there is nothing to change. Only an id the
 * document never described renders raw and badged.
 *
 * An empty order has no block: callers pass `null` to `splicePriorityBlock`
 * (which removes it), and this returns `""` to make that path hard to get
 * wrong.
 */
export function generatePriorityBlock(
  orderedIds: string[],
  entriesById: Map<string, PriorityEntry>,
  recoveredDescriptions?: Map<string, string>
): string {
  const ids: string[] = [];
  for (const id of orderedIds) {
    if (isEmittableId(id) && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return "";

  const lines = [
    RESOURCE_PRIORITY_BEGIN,
    `<!-- order: ${JSON.stringify(ids)} -->`,
    PRIORITY_BLOCK_HEADING,
    PRIORITY_BLOCK_PROSE,
  ];

  ids.forEach((id, index) => {
    const entry = entriesById.get(id);
    const rank = `${String(index + 1)}.`;
    if (entry) {
      lines.push(`${rank} ${describeEntry(entry)}`);
      return;
    }
    const recovered = recoveredDescriptions?.get(id);
    lines.push(
      recovered
        ? // Re-sanitized because the document is hand-editable; on text this
          // module emitted, sanitization is a byte-identical no-op.
          `${rank} ${sanitizePromptText(recovered)}`
        : `${rank} ${sanitizePromptText(id)} — ${MISSING_FROM_LIVE_SUFFIX}`
    );
  });

  lines.push(RESOURCE_PRIORITY_END);
  return lines.join("\n");
}

// Every line this module can emit between the two markers. An orphaned
// opening marker is repaired by replacing the marker AND whatever generated
// body still trails it, and "generated" is judged byte-for-byte against this
// vocabulary — so the repair can never swallow a line a human wrote.
const GENERATED_BODY_LINES = new Set<string>([
  PRIORITY_BLOCK_HEADING,
  ...PRIORITY_BLOCK_PROSE.split("\n"),
]);
const ORDER_COMMENT_LINE_RE = /^<!--\s*order:.*-->$/;
const RANKED_LIST_LINE_RE = /^\d+\.\s/;

/**
 * End of the generated body that trails an orphaned opening marker at `from`.
 *
 * Consumes whole lines while each one is something this module emits, and
 * stops at the first line that isn't — a blank line, hand-written prose, a
 * heading. That keeps the stale half-block out of the prompt (two contradictory
 * ranked lists would be worse than one) while making it impossible to delete
 * anything a human typed. When the order comment survived the hand-edit it is
 * inside these bounds too, so the ranking itself is recovered rather than
 * reported corrupt.
 *
 * A numbered line only counts as generated once a distinctive block line (the
 * heading, the order comment, or a prose line) has been seen: `1. anything`
 * matches the ranked-list shape, and a user who kept the leftover marker but
 * hand-wrote their own list directly beneath it must not have it absorbed.
 */
function orphanRemnantEnd(document: string, from: number): number {
  let cursor = from;
  let blockBodySeen = false;
  while (cursor < document.length) {
    const lineBreak = /^(\r\n|\n|\r)/.exec(document.slice(cursor));
    if (!lineBreak?.[0]) break;
    const lineStart = cursor + lineBreak[0].length;
    const newlineAt = document.indexOf("\n", lineStart);
    const lineEnd = newlineAt === -1 ? document.length : newlineAt;
    const line = document.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (GENERATED_BODY_LINES.has(line) || ORDER_COMMENT_LINE_RE.test(line)) {
      blockBodySeen = true;
    } else if (!blockBodySeen || !RANKED_LIST_LINE_RE.test(line)) {
      break;
    }
    cursor = lineEnd;
  }
  return cursor;
}

/** Bounds of the generated block, `end` exclusive so the pair is slice-ready. */
export interface PriorityBlockBounds {
  start: number;
  end: number;
  /**
   * The opening marker had no closing marker in its own section, so the span
   * covers the leftover marker plus whatever generated body still trails it.
   * See `findPriorityBlock`.
   */
  orphan: boolean;
}

/**
 * Char offsets of the block in `document`, markers included. The markers are
 * single-line literals, so a CRLF document needs no special handling. Only the
 * first block is recognized — a document with two is already hand-mangled, and
 * rewriting the first keeps behavior predictable.
 *
 * The closing marker is searched only as far as the next slot heading. A `## `
 * label is where the worker's parser stops too, so a stray closing marker left
 * in a later section can never make the bounds swallow the sections between.
 *
 * An opening marker with no closing marker in that window is an ORPHAN — what
 * a user produces by selecting from inside the block through the closing
 * marker and deleting it in the markdown editor. Reporting "no block" there
 * would be a data-loss trap: the next apply would nest a SECOND block below
 * the orphan, and the apply after that would replace everything from the
 * orphan to the new block's closing marker — silently eating whatever
 * hand-written Tool Guidance sat between them. So the orphan marker and the
 * generated lines still trailing it are the extent (see `orphanRemnantEnd`):
 * the next write replaces only text this module itself emitted, never prose,
 * and the document comes back well-formed.
 */
export function findPriorityBlock(
  document: string
): PriorityBlockBounds | null {
  const start = document.indexOf(RESOURCE_PRIORITY_BEGIN);
  if (start === -1) return null;

  const searchFrom = start + RESOURCE_PRIORITY_BEGIN.length;
  const limit = nextSlotHeadingStart(document, searchFrom);
  const endMarker = document.indexOf(RESOURCE_PRIORITY_END, searchFrom);
  if (endMarker === -1 || endMarker >= limit) {
    return { start, end: orphanRemnantEnd(document, searchFrom), orphan: true };
  }
  return {
    start,
    end: endMarker + RESOURCE_PRIORITY_END.length,
    orphan: false,
  };
}

/**
 * The stored order, or `null` when the document has no block at all.
 *
 * `"corrupt"` means a block is there but the order line isn't readable — a
 * hand-edit, most likely, including an orphaned opening marker whose order
 * line went with the closing one. (When the order line survived, it is inside
 * the orphan's bounds and the ranking is recovered normally.) The caller
 * treats corrupt as unconfigured but must NOT rewrite the document behind the
 * user's back: the panel surfaces a "couldn't read the saved ordering" notice
 * offering Reset instead, and the next deliberate apply repairs the block.
 */
export function parsePriorityOrder(
  document: string
): string[] | null | "corrupt" {
  const bounds = findPriorityBlock(document);
  if (!bounds) return null;

  const match = ORDER_COMMENT_RE.exec(document.slice(bounds.start, bounds.end));
  if (!match?.[1]) return "corrupt";

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return "corrupt";
  }
  if (!Array.isArray(parsed)) return "corrupt";
  if (!parsed.every((id): id is string => typeof id === "string")) {
    return "corrupt";
  }
  return parsed;
}

/**
 * The description each ranked id currently carries in the document's block,
 * keyed by id — what lets a regeneration preserve the human-readable line for
 * an id the live aggregation can't resolve (see `generatePriorityBlock`).
 *
 * Ids and list lines pair by position, and only when they pair exactly: a
 * hand-edit that broke the 1:1 correspondence recovers nothing rather than
 * risk attributing one resource's description to another.
 */
export function parsePriorityDescriptions(
  document: string
): Map<string, string> {
  const recovered = new Map<string, string>();
  const bounds = findPriorityBlock(document);
  if (!bounds) return recovered;
  const order = parsePriorityOrder(document);
  if (!Array.isArray(order)) return recovered;

  const descriptions = document
    .slice(bounds.start, bounds.end)
    .split(/\r?\n/)
    .map((line) => /^\d+\.\s+(.*)$/.exec(line)?.[1]?.trim())
    .filter((text): text is string => text !== undefined && text.length > 0);
  if (descriptions.length !== order.length) return recovered;

  order.forEach((id, index) => {
    const text = descriptions[index];
    if (text) recovered.set(id, text);
  });
  return recovered;
}

// The worker's parser splits on the seven exact `## <label>` lines and nothing
// else, so those — and only those — are section boundaries here too. A
// `## Notes` heading someone added inside Tool Guidance is section content,
// and the block has to land after it.
const SLOT_HEADING_LABELS = new Set(
  PROMPT_SLOTS.map((slot) => SLOT_LABELS[slot])
);

// Where a synthesized `## Tool Guidance` heading goes when the document has
// none: immediately before the first of the slots that follow it, so the block
// keeps its prompt position instead of landing after the closing.
const HEADINGS_AFTER_TOOL_GUIDANCE: PromptSlot[] = [
  "instructions",
  "client_instructions",
  "memory_instructions",
  "closing",
];

const SLOT_HEADING_RE = /^##[ \t]+(.+?)[ \t\r]*$/gm;

interface SlotHeading {
  label: string;
  /** Char offset of the `#` that opens the line. */
  start: number;
}

/**
 * Offset of the first slot heading at or after `from`, or the end of the
 * document. This is the horizon for anything that scans forward from inside a
 * section: the worker's parser treats these lines as hard boundaries, so we
 * must not reach across one either.
 */
function nextSlotHeadingStart(document: string, from: number): number {
  for (const heading of findSlotHeadings(document)) {
    if (heading.start >= from) return heading.start;
  }
  return document.length;
}

function findSlotHeadings(document: string): SlotHeading[] {
  const headings: SlotHeading[] = [];
  SLOT_HEADING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLOT_HEADING_RE.exec(document)) !== null) {
    const label = match[1];
    if (label && SLOT_HEADING_LABELS.has(label)) {
      headings.push({ label, start: match.index });
    }
  }
  return headings;
}

/** Match the document's own line endings, so a CRLF document stays CRLF. */
function newlineOf(document: string): string {
  return document.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Join `content` between `head` and `tail`, separated from each by exactly one
 * blank line — the same spacing the removal path collapses back to, which is
 * what lets a configure-then-remove round trip return the original document.
 */
function joinAround(
  head: string,
  content: string,
  tail: string,
  newline: string
): string {
  const body = newline === "\n" ? content : content.replace(/\n/g, newline);
  const parts: string[] = [];
  if (head) parts.push(head, newline, newline);
  parts.push(body);
  parts.push(tail ? `${newline}${newline}${tail}` : newline);
  return parts.join("");
}

function insertAt(
  document: string,
  pos: number,
  content: string,
  newline: string
): string {
  return joinAround(
    document.slice(0, pos).replace(/[ \t\r\n]+$/, ""),
    content,
    document.slice(pos).replace(/^[ \t\r\n]+/, ""),
    newline
  );
}

/**
 * Write `block` into `document`, or remove the block when `block` is `null`.
 *
 * An existing block is replaced where it stands, which is what makes the
 * operation idempotent: `splice(splice(d, b), b) === splice(d, b)`. An
 * orphaned opening marker counts as an existing block bounded to the marker
 * itself, so writing over it repairs the document instead of nesting a second
 * block below it. A first write lands at the END of the `## Tool Guidance`
 * section — after whatever hand-written guidance is already there, before the
 * next slot heading. When the document has no Tool Guidance section the
 * heading is synthesized, since the worker discards anything ahead of the
 * first recognized heading.
 *
 * Removal collapses the surrounding blank lines back to one, so a
 * configure-then-remove round trip returns the canonical scaffold unchanged.
 */
export function splicePriorityBlock(
  document: string,
  block: string | null
): string {
  const newline = newlineOf(document);
  const existing = findPriorityBlock(document);

  if (existing) {
    const head = document.slice(0, existing.start).replace(/[ \t\r\n]+$/, "");
    const tail = document.slice(existing.end).replace(/^[ \t\r\n]+/, "");
    if (block === null || block.length === 0) {
      if (!head) return tail;
      return tail ? `${head}${newline}${newline}${tail}` : `${head}${newline}`;
    }
    return joinAround(head, block, tail, newline);
  }

  if (block === null || block.length === 0) return document;

  const headings = findSlotHeadings(document);
  const toolGuidanceIndex = headings.findIndex(
    (heading) => heading.label === SLOT_LABELS.tool_guidance
  );

  if (toolGuidanceIndex !== -1) {
    const next = headings[toolGuidanceIndex + 1];
    return insertAt(
      document,
      next ? next.start : document.length,
      block,
      newline
    );
  }

  // No Tool Guidance section: synthesize the heading with the block under it.
  const withHeading = `## ${SLOT_LABELS.tool_guidance}\n\n${block}`;
  const successorLabels = new Set(
    HEADINGS_AFTER_TOOL_GUIDANCE.map((slot) => SLOT_LABELS[slot])
  );
  const successor = headings.find((heading) =>
    successorLabels.has(heading.label)
  );
  return insertAt(
    document,
    successor ? successor.start : document.length,
    withHeading,
    newline
  );
}
