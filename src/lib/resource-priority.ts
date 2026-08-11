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

/**
 * The upstream document-length limit, measured over the whole document with
 * the block included.
 *
 * Nothing in this repo enforces it: the portal's own `worker/` BFF proxies the
 * body through untouched, and the 400 comes from the engine beyond it. So this
 * is a PREFLIGHT MIRROR, not the rule — its only job is to fail an apply in
 * the panel, where the user can still act on it, instead of at a save that
 * comes back rejected. Being a mirror, it can go stale: if the upstream limit
 * moves, nothing here notices, and the failure mode is a save the portal
 * thought would work (or refuses when it would have).
 */
export const MAX_MODE_DOCUMENT_LENGTH = 64000;

/** Whether a prospective document fits — and if not, whose doing it is. */
export type PriorityLengthVerdict = "ok" | "over-from-edit" | "over-untouched";

/**
 * Classify the length of the document an apply would write.
 *
 * `edited` means "the user has touched the ranking in this session". The
 * distinction is the whole point: the prospective document is regenerated the
 * moment the panel opens, before anyone has done anything, so a large document
 * whose stored block predates a change to the generated text (#281 added a
 * paragraph to it) can be over the limit on arrival. Blaming "this ranking"
 * there names a ranking the user didn't make and prescribes a fix — rank fewer
 * resources — that isn't the one available to them.
 */
export function priorityLengthVerdict(
  nextDocument: string,
  edited: boolean
): PriorityLengthVerdict {
  if (nextDocument.length <= MAX_MODE_DOCUMENT_LENGTH) return "ok";
  return edited ? "over-from-edit" : "over-untouched";
}

/** What the panel needs to know to claim an apply is a harmless refresh. */
export interface OfferedRefreshInput {
  /** Nothing is blocking Apply — it is live and clickable. */
  applyEnabled: boolean;
  /** A previous apply failed and is still being reported. */
  hasApplyError: boolean;
  /** The user has reordered something in this session. */
  userReordered: boolean;
  /** Exactly what `parsePriorityOrder` returned for the current document. */
  storedOrder: string[] | null | "corrupt";
  /** The ranking this apply would write, in order. */
  orderedIds: string[];
  /** The block this apply would write. `""` means the apply REMOVES it. */
  blockToWrite: string;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Whether an enabled Apply on an untouched panel is a ranking-preserving
 * REFRESH of the generated block — the only state in which the panel may say
 * so.
 *
 * "Apply is enabled and the user hasn't reordered" is not enough on its own,
 * and the two states it wrongly swept in are the two where the reassurance is
 * most harmful:
 *
 *   - A CORRUPT block. The order line is unreadable, so the stored order reads
 *     as empty, so the block to write is empty, so the apply REMOVES the block
 *     rather than refreshing it. The panel is already showing a red notice
 *     saying exactly that; a calm "your ranking is unchanged" next to it
 *     invites the user to click through and lose a ranking they would
 *     otherwise have retyped. Hence both the readable-order check and the
 *     empty-block check — the latter also covers any other path where the
 *     apply's real effect is removal.
 *   - A stored order that will be NORMALIZED on the way out. Duplicate ids
 *     survive in a hand-edited document but are collapsed by both
 *     `mergeOrderWithLive` and `generatePriorityBlock`, so an untouched panel
 *     can be offering to rewrite the ranking itself — while the copy promises
 *     the saved order is kept exactly as it is. The order this apply would
 *     write therefore has to match the stored one element for element, which
 *     catches dedup and any normalization added later. Where it doesn't
 *     match, the plain enabled Apply with no banner is the honest state.
 *   - A healthy block whose DESCRIPTIONS have drifted. The delta is a
 *     description rewrite; the disclosure is already present. Still a
 *     ranking-preserving refresh, so this returns true — but it is why the
 *     copy must describe the whole delta rather than name the disclosure as
 *     the reason.
 */
export function isOfferedBlockRefresh(input: OfferedRefreshInput): boolean {
  if (!input.applyEnabled) return false;
  if (input.hasApplyError) return false;
  if (input.userReordered) return false;
  // Covers "corrupt" and "no block at all" in one: neither is an order this
  // apply could be said to preserve.
  if (!Array.isArray(input.storedOrder)) return false;
  if (!sameSequence(input.storedOrder, input.orderedIds)) return false;
  // An apply that writes nothing is a removal, not a refresh.
  if (input.blockToWrite.length === 0) return false;
  return true;
}

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

// The disclosure (#281). A ranking biases retrieval; it does not bind it, and
// the reader of an answer is the one person who cannot tell which happened.
// BT Servant already advertises when it answers from its own training, so this
// is the same courtesy extended to the ranked-source case: when the answer did
// NOT come from the top-ranked source that covers the question, say so.
//
// It lives inside the generated block, so it exists only where a ranking
// exists — an empty order emits no block at all (see `generatePriorityBlock`),
// which is what keeps a dangling "outside your priorities" instruction out of
// a document that has no priorities to be outside of.
//
// Wrapped like the prose above it, and separated from the ranked list by a
// BLANK LINE — which is load-bearing, not cosmetic. Under CommonMark, a
// non-indented paragraph butted straight up against a list is a LAZY
// CONTINUATION of the last list item. Every CommonMark reader downstream —
// the model consuming this prompt, for which markdown structure is how
// grouping is expressed, and any renderer that ever displays the document —
// would take a global instruction for a note hanging off the LOWEST-ranked
// resource, which inverts its meaning. The blank line makes it a sibling
// block. `tests/resource-priority.test.ts` asserts the parse, both ways.
//
// The cost is that `orphanRemnantEnd` can no longer treat "blank line" as an
// unconditional stop, so it takes a one-line lookahead — see there.
export const RESOURCE_PRIORITY_DISCLOSURE = [
  "When your answer draws on anything other than the highest-ranked source that covers the question —",
  "a lower-ranked source, or a resource not ranked here — say so in the same reply, and name what you",
  "drew on instead. One short sentence is enough.",
].join("\n");

/**
 * The same promise, said to the admin configuring it — the panel's explainer
 * line, so an admin learns the disclosure follows from ranking without opening
 * the block preview.
 *
 * It lives HERE, pressed up against the instruction it paraphrases, because
 * two descriptions of one behavior in two files drift silently: the UI ends up
 * promising a scope the prompt never asks for. A test pins the trigger wording
 * they must share; edit one and the other has to move with it.
 */
export const RESOURCE_PRIORITY_DISCLOSURE_SUMMARY =
  "When an answer draws on a lower-ranked source, or a resource not ranked here, BT Servant is asked to say so in the reply.";

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
 * wrong. The disclosure paragraph (#281) rides inside the block for the same
 * reason — no ranking, no block, no instruction about departing from one.
 *
 * Documents generated before #281 carry the block WITHOUT that paragraph. They
 * parse identically (the markers, the order comment and the numbered lines are
 * untouched), so nothing about them reads as corrupt; the difference is that a
 * regeneration is no longer byte-identical to what is stored, so the panel's
 * Apply comes up enabled and one deliberate apply upgrades the block in place.
 * The rewrite is bounded by the markers, so it neither duplicates the block nor
 * disturbs the guidance around it.
 *
 * That apply is NOT guaranteed to be a paragraph insertion and nothing else.
 * The prose list is regenerated from live data every time (#277's design, see
 * above), so where a label, server name or subject has drifted since the block
 * was last written — or where the panel is enumerating a language that resolves
 * different entries — the same apply rewrites those description lines too. The
 * ORDER is what is guaranteed to survive verbatim; the descriptions are
 * derived, and always were.
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

  // After the list, so "anything other than the highest-ranked source" has the
  // list to refer back to — and behind a blank line, so CommonMark reads it as
  // a paragraph of its own rather than as trailing text of the last ranked
  // item.
  lines.push("", RESOURCE_PRIORITY_DISCLOSURE);
  lines.push(RESOURCE_PRIORITY_END);
  return lines.join("\n");
}

// Every line this module can emit between the two markers — including every
// line it emitted in any PREVIOUS version, because documents generated by an
// older portal are still out there and their orphans have to repair too. The
// set is append-only for that reason: retiring a line from it would turn a
// stale remnant into text the repair refuses to touch, leaving a contradictory
// half-block in the prompt forever.
//
// An orphaned opening marker is repaired by replacing the marker AND whatever
// generated body still trails it, and "generated" is judged byte-for-byte
// against this vocabulary — so the repair can never swallow a line a human
// wrote.
//
// The block's one blank line is deliberately NOT a member: a blank line is
// also what separates a leftover marker from a user's own prose, so it can't
// be recognized on its own text — and it can't be recognized off this set
// either, since a line like `### Resource priorities` is one a person may well
// have typed. `orphanRemnantEnd` crosses a blank only for a byte-exact match
// of the ENTIRE disclosure paragraph; see there.
const GENERATED_BODY_LINES = new Set<string>([
  PRIORITY_BLOCK_HEADING,
  ...PRIORITY_BLOCK_PROSE.split("\n"),
  ...RESOURCE_PRIORITY_DISCLOSURE.split("\n"),
]);
const ORDER_COMMENT_LINE_RE = /^<!--\s*order:.*-->$/;
const RANKED_LIST_LINE_RE = /^\d+\.\s/;

/**
 * End of the generated body that trails an orphaned opening marker at `from`.
 *
 * Consumes whole lines while each one is something this module emits, and
 * stops at the first line that isn't — hand-written prose, a heading, a blank
 * line that isn't ours. That keeps the stale half-block out of the prompt (two
 * contradictory ranked lists would be worse than one) while making it
 * impossible to delete anything a human typed. When the order comment survived
 * the hand-edit it is inside these bounds too, so the ranking itself is
 * recovered rather than reported corrupt.
 *
 * A numbered line only counts as generated once a distinctive block line (the
 * heading, the order comment, or a prose line) has been seen: `1. anything`
 * matches the ranked-list shape, and a user who kept the leftover marker but
 * hand-wrote their own list directly beneath it must not have it absorbed.
 *
 * A BLANK line is the one case that needs lookahead, and the lookahead is
 * deliberately as narrow as the problem that created it. The block contains
 * exactly one blank line of its own — before the disclosure paragraph, so
 * CommonMark reads that paragraph as a sibling of the ranked list rather than
 * as trailing text inside its last item — and stopping there would strand the
 * paragraph in the document on every repair. But a blank line is also exactly
 * what separates a leftover marker from a user's own prose, so crossing one on
 * a weaker signal is how this function would come to delete something a human
 * wrote. Recognizing merely "vocabulary on the next line" is such a weaker
 * signal: `### Resource priorities` is a heading a person can perfectly well
 * type themselves, and accepting it after a blank would set `blockBodySeen`
 * and hand their own numbered list to the ranked-list rule below.
 *
 * So the crossing recognizes ONLY the complete disclosure paragraph: all of
 * its lines, byte-exact, in order, starting on the line after the blank.
 * Anything less — a hand-written heading, a lone first line, a truncated
 * remnant — stops the walk and is left in the document, which is the safe
 * direction. (Within an unbroken run, single generated lines still match one
 * at a time; that pre-existing exposure is bounded by never crossing a blank.)
 */
function isGeneratedVocabulary(line: string): boolean {
  return GENERATED_BODY_LINES.has(line) || ORDER_COMMENT_LINE_RE.test(line);
}

interface RemnantLine {
  text: string;
  /** Offset of the line's end — where the next line's break begins. */
  end: number;
}

/** The line whose break starts at `cursor`, or `null` if none begins there. */
function remnantLineAt(document: string, cursor: number): RemnantLine | null {
  if (cursor >= document.length) return null;
  const lineBreak = /^(\r\n|\n|\r)/.exec(document.slice(cursor));
  if (!lineBreak?.[0]) return null;
  const lineStart = cursor + lineBreak[0].length;
  const newlineAt = document.indexOf("\n", lineStart);
  const end = newlineAt === -1 ? document.length : newlineAt;
  return { text: document.slice(lineStart, end).replace(/\r$/, ""), end };
}

const DISCLOSURE_LINES = RESOURCE_PRIORITY_DISCLOSURE.split("\n");

/**
 * End offset of the whole disclosure paragraph if it begins on the line after
 * `cursor`, or `null` — the only thing allowed to carry the walk over a blank
 * line. All-or-nothing on purpose: a partial match is indistinguishable from
 * a person having typed one of these sentences, so it isn't a match.
 */
function disclosureParagraphEnd(
  document: string,
  cursor: number
): number | null {
  let at = cursor;
  for (const expected of DISCLOSURE_LINES) {
    const line = remnantLineAt(document, at);
    if (!line || line.text !== expected) return null;
    at = line.end;
  }
  return at;
}

function orphanRemnantEnd(document: string, from: number): number {
  let cursor = from;
  let blockBodySeen = false;
  for (;;) {
    const line = remnantLineAt(document, cursor);
    if (!line) break;

    if (line.text.length === 0) {
      const paragraphEnd = disclosureParagraphEnd(document, line.end);
      if (paragraphEnd === null) break;
      // The blank and the whole paragraph, consumed as one unit.
      blockBodySeen = true;
      cursor = paragraphEnd;
      continue;
    }

    if (isGeneratedVocabulary(line.text)) {
      blockBodySeen = true;
    } else if (!blockBodySeen || !RANKED_LIST_LINE_RE.test(line.text)) {
      break;
    }
    cursor = line.end;
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
