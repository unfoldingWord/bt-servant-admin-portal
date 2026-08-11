import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { MODE_DOCUMENT_SCAFFOLD } from "../src/lib/mode-scaffold";
import {
  MAX_MODE_DOCUMENT_LENGTH,
  RESOURCE_PRIORITY_BEGIN,
  RESOURCE_PRIORITY_DISCLOSURE,
  RESOURCE_PRIORITY_DISCLOSURE_SUMMARY,
  RESOURCE_PRIORITY_END,
  buildPriorityEntries,
  findPriorityBlock,
  generatePriorityBlock,
  isOfferedBlockRefresh,
  mergeOrderWithLive,
  parsePriorityDescriptions,
  parsePriorityOrder,
  priorityLengthVerdict,
  resourceEntryId,
  sanitizePromptText,
  splicePriorityBlock,
} from "../src/lib/resource-priority";
import type {
  OfferedRefreshInput,
  PriorityEntry,
} from "../src/lib/resource-priority";
import type {
  AggregatedResourcesResponse,
  ResourceItem,
  ResourceServerReport,
} from "../src/types/resources";

function entry(
  id: string,
  label: string,
  serverName: string,
  subjectLabelText = "Bible Translations"
): PriorityEntry {
  return { id, label, serverName, subjectLabelText };
}

function byId(entries: PriorityEntry[]): Map<string, PriorityEntry> {
  return new Map(entries.map((e) => [e.id, e]));
}

const ULT = entry(
  "translation-helps:en_ult",
  "unfoldingWord Literal Text",
  "translation-helps"
);
const STUDY_NOTES = entry(
  "aquifer:BiblicaStudyNotes",
  "Biblica Study Notes",
  "aquifer",
  "Study Notes"
);
const ORDER = [ULT.id, STUDY_NOTES.id];
const BLOCK = generatePriorityBlock(ORDER, byId([ULT, STUDY_NOTES]));

// The exact instruction the block carries (#281). Spelled out rather than just
// re-exported because it is product-visible prompt wording: an edit to it
// should have to be deliberate enough to update a test.
const DISCLOSURE_TEXT = [
  "When your answer draws on anything other than the highest-ranked source that covers the question —",
  "a lower-ranked source, or a resource not ranked here — say so in the same reply, and name what you",
  "drew on instead. One short sentence is enough.",
].join("\n");

// CommonMark + GFM, the same pair the portal already ships for rendering
// (`components/chat-message.tsx`). Standing in here for every CommonMark
// reader downstream of the block — starting with the model the prompt is
// built for, which reads grouping off exactly this structure.
function parseMarkdown(source: string) {
  return unified().use(remarkParse).use(remarkGfm).parse(source);
}

/** Source text of a parsed node, via its mdast offsets. */
function sliceNode(
  source: string,
  node: { position?: { start: { offset?: number }; end: { offset?: number } } }
): string {
  return source.slice(
    node.position?.start.offset ?? 0,
    node.position?.end.offset ?? 0
  );
}

// Byte-for-byte what the portal emitted for ORDER before #281 (v1.11.0, PR
// #282). Frozen on purpose: this is the block sitting in real mode documents
// right now, and every parse path has to keep handling it.
const PRE_281_BLOCK = [
  RESOURCE_PRIORITY_BEGIN,
  '<!-- order: ["translation-helps:en_ult","aquifer:BiblicaStudyNotes"] -->',
  "### Resource priorities",
  "When answering from resources, strongly prefer the sources below, in this order. Answer from the",
  "highest-ranked source that covers the question; fall back to the next-ranked source only when the",
  "higher one does not cover it. Use unranked resources only when none of the ranked sources apply.",
  "1. unfoldingWord Literal Text — translation-helps (Bible Translations)",
  "2. Biblica Study Notes — aquifer (Study Notes)",
  RESOURCE_PRIORITY_END,
].join("\n");

function server(serverId: string, serverName: string): ResourceServerReport {
  return { serverId, serverName, status: "ok" };
}

function item(
  serverId: string,
  name: string,
  subject: string,
  label?: string
): ResourceItem {
  return { serverId, name, subject, label };
}

function response(
  servers: ResourceServerReport[],
  resources: Record<string, ResourceItem[]>
): AggregatedResourcesResponse {
  return { org: "uw", language: "en", servers, resources };
}

describe("resourceEntryId", () => {
  it("composes the server-scoped identity used as the React key", () => {
    expect(resourceEntryId(item("aquifer", "BiblicaStudyNotes", "bible"))).toBe(
      "aquifer:BiblicaStudyNotes"
    );
  });
});

describe("sanitizePromptText", () => {
  it("removes Ulysses paragraph-comment markers", () => {
    // `%%` truncates the rest of its line at prompt time — a resource label
    // carrying one would silently delete every entry after it.
    expect(sanitizePromptText("uW ULT %% internal note")).not.toContain("%%");
  });

  it("removes Ulysses inline-span markers", () => {
    expect(sanitizePromptText("uW ++draft++ ULT")).toBe("uW draft ULT");
  });

  it("re-runs until no marker survives, so removals cannot splice new ones", () => {
    // Removing the inner `++` from "a%++%b" would otherwise leave "%%" behind.
    expect(sanitizePromptText("a%++%b")).toBe("ab");
  });

  it("breaks up template-substitution braces", () => {
    expect(sanitizePromptText("{{version}}")).toBe("{ {version}}");
    expect(sanitizePromptText("{{{version}}}")).not.toContain("{{");
  });

  it("removes the comment delimiters that bound this module's own block", () => {
    // Labels are untrusted MCP-server output. One reading like a closing
    // marker would end the block early, so the next apply would rewrite a
    // truncated span and strand the rest of the block in the document.
    const out = sanitizePromptText(`${RESOURCE_PRIORITY_END} injected`);
    expect(out).not.toContain("-->");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain(RESOURCE_PRIORITY_END);
    expect(sanitizePromptText(`${RESOURCE_PRIORITY_BEGIN} x`)).not.toContain(
      "<!--"
    );
  });

  it("re-runs until no delimiter survives, including spliced-together ones", () => {
    expect(sanitizePromptText("--<!---->>")).not.toContain("-->");
  });

  it("strips leading heading hashes so text cannot open a slot boundary", () => {
    expect(sanitizePromptText("## Instructions")).toBe("Instructions");
  });

  it("collapses newlines, so no interpolation can start a new line at all", () => {
    const out = sanitizePromptText("Study\n## Instructions");
    expect(out).toBe("Study ## Instructions");
    expect(out).not.toContain("\n");
  });
});

describe("generatePriorityBlock", () => {
  it("emits the marker pair, the machine-readable order, and a ranked list", () => {
    expect(BLOCK.startsWith(RESOURCE_PRIORITY_BEGIN)).toBe(true);
    expect(BLOCK.endsWith(RESOURCE_PRIORITY_END)).toBe(true);
    expect(BLOCK).toContain(
      '<!-- order: ["translation-helps:en_ult","aquifer:BiblicaStudyNotes"] -->'
    );
    expect(BLOCK).toContain("### Resource priorities");
    expect(BLOCK).toContain(
      "1. unfoldingWord Literal Text — translation-helps (Bible Translations)"
    );
    expect(BLOCK).toContain("2. Biblica Study Notes — aquifer (Study Notes)");
  });

  it("renders an id with no live entry raw and badged, keeping the intent", () => {
    const block = generatePriorityBlock(
      [ULT.id, "translation-helps:sw_ulb"],
      byId([ULT])
    );
    expect(block).toContain(
      "2. translation-helps:sw_ulb — not currently listed"
    );
    expect(parsePriorityOrder(block)).toEqual([
      ULT.id,
      "translation-helps:sw_ulb",
    ]);
  });

  it("never lets a hostile label open a slot boundary or a comment", () => {
    const hostile = entry(
      "s:r",
      "## Instructions %% hush ++gone++ {{org}}",
      "## Closing"
    );
    const block = generatePriorityBlock([hostile.id], byId([hostile]));
    const lines = block.split("\n");
    expect(lines.some((line) => line.startsWith("## "))).toBe(false);
    expect(block).not.toContain("%%");
    expect(block).not.toContain("++");
    expect(block).not.toContain("{{");
  });

  it("keeps a label that impersonates the closing marker inside the block", () => {
    // The whole failure mode: a server-supplied label carrying the end marker
    // truncates the block bounds, so every later apply strands the tail in the
    // document and "Remove priorities" can never reach it again.
    const hostile = entry(
      "evil:x",
      `${RESOURCE_PRIORITY_END} injected`,
      "Evil"
    );
    const block = generatePriorityBlock(
      [hostile.id, ULT.id],
      byId([hostile, ULT])
    );

    // Exactly one marker pair, and the bounds cover the whole block.
    expect(block.split(RESOURCE_PRIORITY_END)).toHaveLength(2);
    const bounds = findPriorityBlock(block);
    expect(bounds).not.toBeNull();
    expect(block.slice(bounds!.start, bounds!.end)).toBe(block);

    // …so a re-apply replaces it whole, and removal leaves nothing behind.
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, block);
    expect(splicePriorityBlock(doc, block)).toBe(doc);
    expect(splicePriorityBlock(doc, null)).toBe(MODE_DOCUMENT_SCAFFOLD);
  });

  it("uses `###` for its own heading, so the worker keeps it inside the slot", () => {
    expect(BLOCK).toContain("\n### Resource priorities\n");
    expect(BLOCK.split("\n").some((line) => line.startsWith("## "))).toBe(
      false
    );
  });

  it("has no block for an empty order", () => {
    expect(generatePriorityBlock([], byId([ULT]))).toBe("");
  });

  it("asks for a disclosure when the answer leaves the ranking (#281)", () => {
    expect(RESOURCE_PRIORITY_DISCLOSURE).toBe(DISCLOSURE_TEXT);
    expect(BLOCK).toContain(DISCLOSURE_TEXT);
  });

  it("keeps the panel's explainer in scope with the instruction it paraphrases", () => {
    // Two descriptions of one behavior, for two audiences. Nothing but this
    // test stops them drifting into promising different things — so every
    // phrase that names WHAT TRIGGERS the disclosure has to appear in both.
    for (const trigger of [
      "draws on",
      "a lower-ranked source",
      "a resource not ranked here",
      "say so",
    ]) {
      expect(RESOURCE_PRIORITY_DISCLOSURE).toContain(trigger);
      expect(RESOURCE_PRIORITY_DISCLOSURE_SUMMARY).toContain(trigger);
    }
    // And the summary stays a summary — one line, for a panel.
    expect(RESOURCE_PRIORITY_DISCLOSURE_SUMMARY).not.toContain("\n");
  });

  it("parses as a sibling block of the ranked list, not as part of its last item", () => {
    // The whole point of the paragraph is that it is GLOBAL. Under CommonMark
    // a non-indented paragraph butted against a list is a lazy continuation of
    // the last list item, so without a blank line every renderer downstream
    // would present a global instruction as a footnote on the lowest-ranked
    // resource — the exact inversion of its meaning.
    const tree = parseMarkdown(BLOCK);
    const types = tree.children.map((node) => node.type);
    const listIndex = types.indexOf("list");
    expect(listIndex).toBeGreaterThan(-1);
    expect(types[listIndex + 1]).toBe("paragraph");

    const list = tree.children[listIndex];
    expect(list?.type).toBe("list");
    if (list?.type !== "list") throw new Error("expected a list node");
    expect(list.children).toHaveLength(ORDER.length);
    expect(sliceNode(BLOCK, list)).not.toContain("say so in the same reply");

    const paragraph = tree.children[listIndex + 1];
    expect(paragraph).toBeDefined();
    expect(sliceNode(BLOCK, paragraph!)).toBe(DISCLOSURE_TEXT);
  });

  it("would be swallowed into the last ranked item without the blank line", () => {
    // Guards the guard: proves the assertion above is about the blank line and
    // not about something CommonMark would have done for us anyway.
    const glued = BLOCK.replace(
      `\n\n${DISCLOSURE_TEXT}`,
      `\n${DISCLOSURE_TEXT}`
    );
    const tree = parseMarkdown(glued);
    const types = tree.children.map((node) => node.type);
    const listIndex = types.indexOf("list");
    expect(types[listIndex + 1]).not.toBe("paragraph");
    expect(sliceNode(glued, tree.children[listIndex]!)).toContain(
      "say so in the same reply"
    );
  });

  it("puts the disclosure after the ranked list, so it can refer back to it", () => {
    const lines = BLOCK.split("\n");
    let lastRanked = -1;
    lines.forEach((line, index) => {
      if (/^\d+\.\s/.test(line)) lastRanked = index;
    });
    const disclosure = lines.indexOf(DISCLOSURE_TEXT.split("\n")[0]!);
    expect(lastRanked).toBeGreaterThan(-1);
    expect(disclosure).toBe(lastRanked + 2);
    expect(lines[lastRanked + 1]).toBe("");
  });

  it("emits no dangling disclosure when nothing is ranked", () => {
    // The instruction only makes sense relative to a ranking. There is no
    // block without one, so there is no instruction either — including on the
    // path that removes the last ranked resource from a configured document.
    const empty = generatePriorityBlock([], byId([ULT]));
    expect(empty).toBe("");
    expect(empty).not.toContain("say so in the same reply");

    const configured = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    const emptied = splicePriorityBlock(configured, empty);
    expect(emptied).toBe(MODE_DOCUMENT_SCAFFOLD);
    expect(emptied).not.toContain("say so in the same reply");
  });

  it("adds the disclosure to the pre-#281 block and changes nothing else", () => {
    // The whole back-compat argument in one assertion: markers, order comment,
    // heading, prose and numbered lines are untouched, so every pre-#281 parse
    // path keeps working and a re-save is a paragraph insertion, not a rewrite.
    expect(BLOCK).toBe(
      PRE_281_BLOCK.replace(
        `\n${RESOURCE_PRIORITY_END}`,
        `\n\n${DISCLOSURE_TEXT}\n${RESOURCE_PRIORITY_END}`
      )
    );
  });
});

describe("pre-#281 documents", () => {
  const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, PRE_281_BLOCK);
  const handWritten = [
    "## Tool Guidance",
    "",
    "Always cite the passage reference before quoting.",
    "",
    PRE_281_BLOCK,
    "",
    "## Instructions",
    "",
    "Be brief.",
    "",
  ].join("\n");

  it("parses the stored order, and never reads as corrupt", () => {
    // A corrupt verdict would put the "we couldn't read the saved ordering"
    // banner in front of every user who ranked anything before today.
    expect(parsePriorityOrder(doc)).toEqual(ORDER);
    expect(parsePriorityOrder(handWritten)).toEqual(ORDER);
  });

  it("still recovers each ranked id's description", () => {
    const recovered = parsePriorityDescriptions(doc);
    expect(recovered.size).toBe(2);
    expect(recovered.get(ULT.id)).toBe(
      "unfoldingWord Literal Text — translation-helps (Bible Translations)"
    );
    expect(recovered.get(STUDY_NOTES.id)).toBe(
      "Biblica Study Notes — aquifer (Study Notes)"
    );
  });

  it("upgrades in place on re-save, losing nothing around it", () => {
    const regenerated = generatePriorityBlock(ORDER, byId([ULT, STUDY_NOTES]));
    const out = splicePriorityBlock(handWritten, regenerated);

    // Exactly one block, in the same place, with the guidance around it intact.
    expect(out.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(out.split(RESOURCE_PRIORITY_END)).toHaveLength(2);
    expect(out).toContain("Always cite the passage reference before quoting.");
    expect(out).toContain("Be brief.");
    expect(out.indexOf(RESOURCE_PRIORITY_BEGIN)).toBe(
      handWritten.indexOf(RESOURCE_PRIORITY_BEGIN)
    );

    // The ranking survives verbatim, and the disclosure is now there once.
    expect(parsePriorityOrder(out)).toEqual(ORDER);
    expect(out.split(DISCLOSURE_TEXT)).toHaveLength(2);
    expect(parsePriorityDescriptions(out).size).toBe(2);

    // And it settles: the upgrade happens once, not on every open.
    expect(splicePriorityBlock(out, regenerated)).toBe(out);
  });

  it("offers the upgrade rather than performing it silently", () => {
    // `unchanged` on the panel is document equality. A pre-#281 document is no
    // longer byte-identical to its regeneration, so Apply comes up enabled —
    // deliberately: the block is only rewritten when a user applies.
    const regenerated = generatePriorityBlock(ORDER, byId([ULT, STUDY_NOTES]));
    expect(splicePriorityBlock(doc, regenerated)).not.toBe(doc);
    expect(parsePriorityOrder(doc)).not.toBe("corrupt");
  });

  it("repairs a pre-#281 orphan without stranding its body", () => {
    // An older document whose closing marker was hand-deleted: the remnant is
    // pre-#281 vocabulary, which is why GENERATED_BODY_LINES is append-only.
    const orphaned = [
      "## Tool Guidance",
      "",
      PRE_281_BLOCK.replace(`\n${RESOURCE_PRIORITY_END}`, ""),
      "",
      "Always cite the passage reference before quoting.",
      "",
      "## Instructions",
      "",
      "Be brief.",
      "",
    ].join("\n");

    expect(findPriorityBlock(orphaned)?.orphan).toBe(true);

    const repaired = splicePriorityBlock(orphaned, BLOCK);
    expect(repaired.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(repaired.split(RESOURCE_PRIORITY_END)).toHaveLength(2);
    // One copy of every generated line, not two: the stale remnant was
    // replaced, not left sitting above the new block.
    expect(
      repaired.split(
        "When answering from resources, strongly prefer the sources below, in this order. Answer from the"
      )
    ).toHaveLength(2);
    expect(repaired.split("1. unfoldingWord Literal Text")).toHaveLength(2);
    expect(repaired).toContain(
      "Always cite the passage reference before quoting."
    );
    expect(parsePriorityOrder(repaired)).toEqual(ORDER);
    expect(splicePriorityBlock(repaired, BLOCK)).toBe(repaired);
  });

  it("absorbs the disclosure when a current-format block is orphaned", () => {
    // Same repair, one version forward: the new paragraph has to be inside the
    // orphan's bounds too, or every repair would leave a second copy behind.
    const orphaned = [
      "## Tool Guidance",
      "",
      BLOCK.replace(`\n${RESOURCE_PRIORITY_END}`, ""),
      "",
      "Always cite the passage reference before quoting.",
      "",
    ].join("\n");

    const repaired = splicePriorityBlock(orphaned, BLOCK);
    expect(repaired.split(DISCLOSURE_TEXT)).toHaveLength(2);
    expect(repaired.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(repaired).toContain(
      "Always cite the passage reference before quoting."
    );
    expect(splicePriorityBlock(repaired, BLOCK)).toBe(repaired);
  });

  it("removes a pre-#281 block cleanly", () => {
    expect(splicePriorityBlock(doc, null)).toBe(MODE_DOCUMENT_SCAFFOLD);
  });
});

describe("parsePriorityOrder", () => {
  it("round-trips a generated block", () => {
    expect(parsePriorityOrder(BLOCK)).toEqual(ORDER);
  });

  it("round-trips through a document splice", () => {
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    expect(parsePriorityOrder(doc)).toEqual(ORDER);
  });

  it("returns null when the document has no block", () => {
    expect(parsePriorityOrder(MODE_DOCUMENT_SCAFFOLD)).toBeNull();
    expect(parsePriorityOrder("")).toBeNull();
  });

  it("reports corrupt when only the opening marker survives a hand-edit", () => {
    // NOT null: reporting "no block" would let the next apply nest a second
    // block below the orphan, and the apply after that would delete everything
    // between them — hand-written guidance included.
    expect(parsePriorityOrder(`${RESOURCE_PRIORITY_BEGIN}\n### x\n`)).toBe(
      "corrupt"
    );
  });

  it("recovers the order when only the closing marker was deleted", () => {
    // The order comment is generated text, so it is inside the orphan's bounds
    // and still readable — no reason to make the user re-rank from scratch.
    const orphaned = BLOCK.replace(`\n${RESOURCE_PRIORITY_END}`, "");
    expect(parsePriorityOrder(orphaned)).toEqual(ORDER);
  });

  it("reports corrupt when the order line is missing", () => {
    const doc = `${RESOURCE_PRIORITY_BEGIN}\n### Resource priorities\n1. something\n${RESOURCE_PRIORITY_END}`;
    expect(parsePriorityOrder(doc)).toBe("corrupt");
  });

  it("reports corrupt when the order line is not valid JSON", () => {
    const doc = `${RESOURCE_PRIORITY_BEGIN}\n<!-- order: [oops] -->\n${RESOURCE_PRIORITY_END}`;
    expect(parsePriorityOrder(doc)).toBe("corrupt");
  });

  it("reports corrupt when the JSON is not a list of ids", () => {
    const notArray = `${RESOURCE_PRIORITY_BEGIN}\n<!-- order: ["a" -->\n${RESOURCE_PRIORITY_END}`;
    const notStrings = `${RESOURCE_PRIORITY_BEGIN}\n<!-- order: [1,2] -->\n${RESOURCE_PRIORITY_END}`;
    expect(parsePriorityOrder(notArray)).toBe("corrupt");
    expect(parsePriorityOrder(notStrings)).toBe("corrupt");
  });
});

describe("findPriorityBlock", () => {
  it("bounds the block by its markers, slice-ready", () => {
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    const bounds = findPriorityBlock(doc);
    expect(bounds).not.toBeNull();
    expect(bounds!.orphan).toBe(false);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(BLOCK);
  });

  it("never reaches past a slot heading for the closing marker", () => {
    // A stray closing marker in a later section must not make the bounds
    // swallow the sections in between.
    const doc = [
      "## Tool Guidance",
      "",
      RESOURCE_PRIORITY_BEGIN,
      "",
      "## Instructions",
      "",
      "Be brief.",
      "",
      RESOURCE_PRIORITY_END,
      "",
    ].join("\n");

    const bounds = findPriorityBlock(doc);
    expect(bounds).not.toBeNull();
    expect(bounds!.orphan).toBe(true);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(RESOURCE_PRIORITY_BEGIN);
  });

  it("absorbs the generated remnant of an orphan, and nothing else", () => {
    const doc = [
      RESOURCE_PRIORITY_BEGIN,
      "### Resource priorities",
      "1. stale line",
      "",
      "Always cite the passage reference before quoting.",
      "",
    ].join("\n");

    const bounds = findPriorityBlock(doc);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(
      `${RESOURCE_PRIORITY_BEGIN}\n### Resource priorities\n1. stale line`
    );
  });
});

describe("splicePriorityBlock", () => {
  it("lands at the end of Tool Guidance in the canonical scaffold", () => {
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    expect(doc).toBe(
      `## Identity\n\n## Teaching Methodology\n\n## Tool Guidance\n\n${BLOCK}\n\n## Instructions\n\n## Client Instructions\n\n## Memory Instructions\n\n## Closing\n\n`
    );
  });

  it("keeps hand-written guidance above it, and non-slot `##` headings inside the section", () => {
    // Only the seven exact slot labels are boundaries for the worker's
    // parser, so a `## Notes` heading is Tool Guidance content — the block
    // belongs after it, not before.
    const doc = [
      "## Tool Guidance",
      "",
      "Prefer the search tool.",
      "",
      "## Notes",
      "",
      "Scratch notes.",
      "",
      "## Instructions",
      "",
      "Be brief.",
      "",
    ].join("\n");

    const out = splicePriorityBlock(doc, BLOCK);
    expect(out).toBe(
      [
        "## Tool Guidance",
        "",
        "Prefer the search tool.",
        "",
        "## Notes",
        "",
        "Scratch notes.",
        "",
        BLOCK,
        "",
        "## Instructions",
        "",
        "Be brief.",
        "",
      ].join("\n")
    );
  });

  it("appends at document end when Tool Guidance is the last section", () => {
    const doc = "## Identity\n\nWho.\n\n## Tool Guidance\n\nPrefer search.\n";
    expect(splicePriorityBlock(doc, BLOCK)).toBe(
      `## Identity\n\nWho.\n\n## Tool Guidance\n\nPrefer search.\n\n${BLOCK}\n`
    );
  });

  it("synthesizes the heading before the first following slot when Tool Guidance is missing", () => {
    // Content before the first recognized heading is discarded by the worker,
    // so the block always arrives under a heading of its own.
    const doc = "## Identity\n\nWho.\n\n## Instructions\n\nBe brief.\n";
    expect(splicePriorityBlock(doc, BLOCK)).toBe(
      `## Identity\n\nWho.\n\n## Tool Guidance\n\n${BLOCK}\n\n## Instructions\n\nBe brief.\n`
    );
  });

  it("synthesizes the heading at the end when no following slot is present either", () => {
    const doc = "## Identity\n\nWho.\n";
    expect(splicePriorityBlock(doc, BLOCK)).toBe(
      `## Identity\n\nWho.\n\n## Tool Guidance\n\n${BLOCK}\n`
    );
  });

  it("is idempotent — a re-applied identical block replaces itself in place", () => {
    const once = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    expect(splicePriorityBlock(once, BLOCK)).toBe(once);
  });

  it("replaces an existing block where it stands rather than adding a second", () => {
    const once = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    const reordered = generatePriorityBlock(
      [STUDY_NOTES.id, ULT.id],
      byId([ULT, STUDY_NOTES])
    );
    const out = splicePriorityBlock(once, reordered);

    expect(out.indexOf(RESOURCE_PRIORITY_BEGIN)).toBe(
      once.indexOf(RESOURCE_PRIORITY_BEGIN)
    );
    expect(out.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(parsePriorityOrder(out)).toEqual([STUDY_NOTES.id, ULT.id]);
  });

  it("regenerates a hand-edited interior wholesale on the next apply", () => {
    const once = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    const tampered = once.replace(
      "### Resource priorities",
      "### Hand edited\n\nnonsense someone typed"
    );
    expect(tampered).not.toBe(once);

    const out = splicePriorityBlock(tampered, BLOCK);
    expect(out).not.toContain("nonsense someone typed");
    expect(out).toBe(once);
  });

  it("repairs an orphaned opening marker instead of nesting a second block", () => {
    // Reachable by selecting from inside the block through the closing marker
    // and deleting it in the markdown editor: the opening marker survives.
    const mangled = [
      "## Tool Guidance",
      "",
      RESOURCE_PRIORITY_BEGIN,
      "### Resource priorities",
      "1. stale line",
      "",
      "Always cite the passage reference before quoting.",
      "",
      "## Instructions",
      "",
      "Be brief.",
      "",
    ].join("\n");

    const repaired = splicePriorityBlock(mangled, BLOCK);

    // One block, the user's prose intact, and stable from here on.
    expect(repaired.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(repaired.split(RESOURCE_PRIORITY_END)).toHaveLength(2);
    expect(repaired).toContain(
      "Always cite the passage reference before quoting."
    );
    expect(repaired).not.toContain("1. stale line");
    expect(parsePriorityOrder(repaired)).toEqual(ORDER);
    expect(splicePriorityBlock(repaired, BLOCK)).toBe(repaired);
  });

  it("removes an orphaned opening marker without touching the prose", () => {
    const mangled = [
      "## Tool Guidance",
      "",
      RESOURCE_PRIORITY_BEGIN,
      "",
      "Always cite the passage reference before quoting.",
      "",
    ].join("\n");

    expect(splicePriorityBlock(mangled, null)).toBe(
      "## Tool Guidance\n\nAlways cite the passage reference before quoting.\n"
    );
  });

  it("removes the block and collapses the blank lines it sat between", () => {
    const once = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
    expect(splicePriorityBlock(once, null)).toBe(MODE_DOCUMENT_SCAFFOLD);
    // An empty generated block (empty order) is the same instruction.
    expect(splicePriorityBlock(once, "")).toBe(MODE_DOCUMENT_SCAFFOLD);
  });

  it("removes a block that is the whole document without leaving stray blank lines", () => {
    expect(splicePriorityBlock(BLOCK, null)).toBe("");
    expect(splicePriorityBlock(`${BLOCK}\n`, null)).toBe("");
  });

  it("leaves a document with no block untouched on removal", () => {
    expect(splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, null)).toBe(
      MODE_DOCUMENT_SCAFFOLD
    );
  });

  it("keeps a CRLF document on CRLF, both writing and removing", () => {
    const crlf = MODE_DOCUMENT_SCAFFOLD.replace(/\n/g, "\r\n");
    const out = splicePriorityBlock(crlf, BLOCK);

    // Every LF is part of a CRLF pair — no mixed endings were introduced.
    expect(out.split("\n")).toHaveLength(out.split("\r\n").length);
    expect(parsePriorityOrder(out)).toEqual(ORDER);
    expect(out.indexOf(RESOURCE_PRIORITY_BEGIN)).toBeGreaterThan(
      out.indexOf("## Tool Guidance")
    );
    expect(out.indexOf(RESOURCE_PRIORITY_END)).toBeLessThan(
      out.indexOf("## Instructions")
    );
    expect(splicePriorityBlock(out, BLOCK)).toBe(out);
    expect(splicePriorityBlock(out, null)).toBe(crlf);
  });
});

describe("buildPriorityEntries", () => {
  it("flattens the by-subject map in response order, resolving names and labels", () => {
    const entries = buildPriorityEntries(
      response(
        [
          server("translation-helps", "Translation Helps"),
          server("aquifer", "Aquifer"),
        ],
        {
          bible: [
            item("translation-helps", "en_ult", "bible"),
            item("aquifer", "NIV", "bible", "New International Version"),
          ],
          "study-notes": [
            item(
              "aquifer",
              "BiblicaStudyNotes",
              "study-notes",
              "Biblica Study Notes"
            ),
          ],
        }
      )
    );

    expect(entries.map((e) => e.id)).toEqual([
      "translation-helps:en_ult",
      "aquifer:NIV",
      "aquifer:BiblicaStudyNotes",
    ]);
    // `label ?? name`, and the subject's display form, not the raw slug.
    expect(entries[0]!.label).toBe("en_ult");
    expect(entries[0]!.serverName).toBe("Translation Helps");
    expect(entries[0]!.subjectLabelText).toBe("Bible Translations");
    expect(entries[1]!.label).toBe("New International Version");
    expect(entries[2]!.subjectLabelText).toBe("Study Notes");
  });

  it("humanizes an unknown subject slug rather than dropping the resource", () => {
    // The canonical subject set is open by contract (worker#257).
    const entries = buildPriorityEntries(
      response([server("fia", "FIA")], {
        "prayer-guides": [item("fia", "guide", "prayer-guides")],
      })
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.subjectLabelText).toBe("Prayer Guides");
  });

  it("falls back to the server id when no report names the server", () => {
    const entries = buildPriorityEntries(
      response([], { bible: [item("orphan", "x", "bible")] })
    );
    expect(entries[0]!.serverName).toBe("orphan");
  });

  it("keeps the first occurrence when an id surfaces under two subjects", () => {
    const entries = buildPriorityEntries(
      response([server("a", "A")], {
        bible: [item("a", "dup", "bible")],
        dictionary: [item("a", "dup", "dictionary")],
      })
    );
    expect(entries.map((e) => e.subjectLabelText)).toEqual([
      "Bible Translations",
    ]);
  });
});

describe("mergeOrderWithLive", () => {
  const live = [ULT, STUDY_NOTES, entry("aquifer:Images", "Images", "aquifer")];

  it("preserves the stored sequence and appends new live resources at the bottom", () => {
    const { entries } = mergeOrderWithLive([STUDY_NOTES.id, ULT.id], live);
    expect(entries.map((e) => e.id)).toEqual([
      STUDY_NOTES.id,
      ULT.id,
      "aquifer:Images",
    ]);
    expect(entries.every((e) => !e.missing)).toBe(true);
  });

  it("keeps every live resource when nothing is stored yet, in server-default order", () => {
    const { entries } = mergeOrderWithLive([], live);
    expect(entries.map((e) => e.id)).toEqual(live.map((e) => e.id));
  });

  it("flags a stored id the live response no longer lists, without dropping it", () => {
    // Stored order is intent, not a snapshot: a language switch or a server
    // outage must not silently erase someone's ranking.
    const { entries } = mergeOrderWithLive(
      ["translation-helps:sw_ulb", ULT.id],
      [ULT]
    );
    expect(entries.map((e) => e.id)).toEqual([
      "translation-helps:sw_ulb",
      ULT.id,
    ]);
    expect(entries[0]!.missing).toBe(true);
    expect(entries[0]!.label).toBe("translation-helps:sw_ulb");
    expect(entries[1]!.missing).toBe(false);
  });

  it("carries an unknown-subject live entry through untouched", () => {
    const odd = entry("fia:guide", "Prayer Guide", "FIA", "Prayer Guides");
    const { entries } = mergeOrderWithLive([odd.id], [odd]);
    expect(entries).toEqual([{ ...odd, missing: false }]);
  });

  it("splits the ranking from the rest of the catalog", () => {
    // The stored order is INTENT — a sparse list. Only `ranked` may be written
    // back, or one Apply would freeze the whole catalog into the prompt and
    // every language switch would grow it again.
    const { ranked, unranked, entries } = mergeOrderWithLive([ULT.id], live);
    expect(ranked.map((e) => e.id)).toEqual([ULT.id]);
    expect(unranked.map((e) => e.id)).toEqual([
      STUDY_NOTES.id,
      "aquifer:Images",
    ]);
    expect(entries).toEqual([...ranked, ...unranked]);
  });

  it("ranks nothing when the order is empty, whatever is live", () => {
    const { ranked, unranked } = mergeOrderWithLive([], live);
    expect(ranked).toEqual([]);
    expect(unranked.map((e) => e.id)).toEqual(live.map((e) => e.id));
  });

  it("keeps a missing stored id in the ranking, not in the candidates", () => {
    const { ranked, unranked } = mergeOrderWithLive(
      ["translation-helps:sw_ulb"],
      [ULT]
    );
    expect(ranked.map((e) => e.id)).toEqual(["translation-helps:sw_ulb"]);
    expect(ranked[0]!.missing).toBe(true);
    expect(unranked.map((e) => e.id)).toEqual([ULT.id]);
  });

  it("ignores a duplicated stored id rather than ranking it twice", () => {
    const { entries } = mergeOrderWithLive([ULT.id, ULT.id], [ULT]);
    expect(entries.map((e) => e.id)).toEqual([ULT.id]);
  });
});

describe("parsePriorityDescriptions", () => {
  const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);

  it("recovers each ranked id's description line from the block", () => {
    const recovered = parsePriorityDescriptions(doc);
    // Exactly the ranked ids: pairing is positional and count-gated, so the
    // disclosure paragraph must not read as a list line (#281).
    expect(recovered.size).toBe(2);
    expect(recovered.get(ULT.id)).toBe(
      "unfoldingWord Literal Text — translation-helps (Bible Translations)"
    );
    expect(recovered.get(STUDY_NOTES.id)).toBe(
      "Biblica Study Notes — aquifer (Study Notes)"
    );
  });

  it("recovers nothing from a document without a block", () => {
    expect(parsePriorityDescriptions(MODE_DOCUMENT_SCAFFOLD).size).toBe(0);
  });

  it("recovers nothing from a corrupt block", () => {
    const broken = doc.replace(/<!-- order:.*-->/, "<!-- order: nonsense -->");
    expect(parsePriorityOrder(broken)).toBe("corrupt");
    expect(parsePriorityDescriptions(broken).size).toBe(0);
  });

  it("recovers nothing when a hand-edit broke the id-to-line pairing", () => {
    // Pairing is positional; guessing over a mismatch could attribute one
    // resource's description to another, which is worse than recovering none.
    const oneLineGone = doc.replace(
      "2. Biblica Study Notes — aquifer (Study Notes)\n",
      ""
    );
    expect(parsePriorityDescriptions(oneLineGone).size).toBe(0);
  });
});

describe("generatePriorityBlock with recovered descriptions", () => {
  const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, BLOCK);
  const recovered = parsePriorityDescriptions(doc);

  it("keeps a missing id's stored description instead of degrading to a raw id", () => {
    // The panel enumerating another language (or a server outage) must not
    // rewrite the prompt's ranked list to raw ids the moment someone applies
    // for an unrelated reason.
    const regenerated = generatePriorityBlock(ORDER, new Map(), recovered);
    expect(regenerated).toContain(
      "1. unfoldingWord Literal Text — translation-helps (Bible Translations)"
    );
    expect(regenerated).not.toContain("not currently listed");
  });

  it("regenerates byte-identically when nothing is live, so Apply stays disabled", () => {
    // `unchanged` is document equality on the page: this identity is what
    // keeps a freshly reopened panel (which resets enumeration to "en") from
    // offering a destructive rewrite with zero user intent behind it.
    const regenerated = generatePriorityBlock(ORDER, new Map(), recovered);
    expect(splicePriorityBlock(doc, regenerated)).toBe(doc);
  });

  it("falls back to the raw id when the document never described it", () => {
    const regenerated = generatePriorityBlock(
      ["fia:new-guide"],
      new Map(),
      recovered
    );
    expect(regenerated).toContain("1. fia:new-guide — not currently listed");
  });
});

describe("mergeOrderWithLive with recovered descriptions", () => {
  it("labels a missing row with its stored description, not its raw id", () => {
    const recovered = new Map([
      ["translation-helps:sw_ulb", "Swahili ULB — translation-helps (Bible)"],
    ]);
    const { ranked } = mergeOrderWithLive(
      ["translation-helps:sw_ulb"],
      [],
      recovered
    );
    expect(ranked[0]!.missing).toBe(true);
    expect(ranked[0]!.label).toBe("Swahili ULB — translation-helps (Bible)");
  });
});

describe("order parse with hostile ids", () => {
  it("round-trips an id containing a closing bracket", () => {
    // JSON.stringify emits `["aquifer:Notes]"]` — a lazy regex would capture
    // through the FIRST `]`, misreport the block as corrupt, and invite the
    // user to "repair" away a healthy ranking.
    const bracketed = entry("aquifer:Notes]", "Notes", "aquifer");
    const ids = [bracketed.id, ULT.id];
    const block = generatePriorityBlock(ids, byId([bracketed, ULT]));
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, block);
    expect(parsePriorityOrder(doc)).toEqual(ids);
  });

  it("round-trips an id containing a quote", () => {
    const quoted = entry('aquifer:"Notes"', "Notes", "aquifer");
    const block = generatePriorityBlock([quoted.id], byId([quoted]));
    const doc = splicePriorityBlock(MODE_DOCUMENT_SCAFFOLD, block);
    expect(parsePriorityOrder(doc)).toEqual([quoted.id]);
  });

  it("round-trips in a CRLF document", () => {
    const bracketed = entry("aquifer:Notes]", "Notes", "aquifer");
    const block = generatePriorityBlock([bracketed.id], byId([bracketed]));
    const doc = splicePriorityBlock(
      MODE_DOCUMENT_SCAFFOLD.replace(/\n/g, "\r\n"),
      block
    );
    expect(parsePriorityOrder(doc)).toEqual([bracketed.id]);
  });
});

describe("orphan repair vs hand-written lists", () => {
  it("does not absorb a hand-written numbered list sitting directly under a leftover marker", () => {
    // A user who deleted everything generated EXCEPT the marker, then wrote
    // their own list beneath it, must not have that list eaten by the repair.
    const doc = `## Tool Guidance\n\n${RESOURCE_PRIORITY_BEGIN}\n1. My own hand-written step\n2. Another hand-written step\n\n## Instructions\n\nBe brief.\n`;
    const bounds = findPriorityBlock(doc);
    expect(bounds?.orphan).toBe(true);
    const repaired = splicePriorityBlock(doc, BLOCK);
    expect(repaired).toContain("1. My own hand-written step");
    expect(repaired).toContain("2. Another hand-written step");
  });

  it("never crosses a blank line for a hand-written heading that looks generated", () => {
    // The blank-line crossing's sharpest edge: `### Resource priorities` is a
    // heading a person can perfectly well type, and it is byte-identical to
    // one this module emits. Crossing the blank for it would mark the body as
    // "generated", hand the user's own numbered list to the ranked-list rule,
    // and delete the whole section on the next apply.
    const doc = [
      "## Tool Guidance",
      "",
      RESOURCE_PRIORITY_BEGIN,
      "",
      "### Resource priorities",
      "1. My own first source",
      "2. My own second source",
      "",
      "## Instructions",
      "",
      "Be brief.",
      "",
    ].join("\n");

    const bounds = findPriorityBlock(doc);
    expect(bounds?.orphan).toBe(true);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(RESOURCE_PRIORITY_BEGIN);

    const repaired = splicePriorityBlock(doc, BLOCK);
    expect(repaired).toContain(
      "### Resource priorities\n1. My own first source"
    );
    expect(repaired).toContain("2. My own second source");
    expect(repaired).toContain("Be brief.");
  });

  it("stops at a blank line only part of the disclosure follows", () => {
    // All-or-nothing: a lone first line is indistinguishable from a person
    // having quoted the sentence, so the walk stops and the remnant is left in
    // the document. Stranding one stale line is the recoverable failure; the
    // other direction deletes prose.
    const firstLine = DISCLOSURE_TEXT.split("\n")[0]!;
    const doc = [
      "## Tool Guidance",
      "",
      RESOURCE_PRIORITY_BEGIN,
      "",
      firstLine,
      "",
      "Always cite the passage reference before quoting.",
      "",
    ].join("\n");

    const bounds = findPriorityBlock(doc);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(RESOURCE_PRIORITY_BEGIN);

    const repaired = splicePriorityBlock(doc, BLOCK);
    expect(repaired).toContain(firstLine);
    expect(repaired).toContain(
      "Always cite the passage reference before quoting."
    );
  });

  it("stops at a blank line a hand-written list follows", () => {
    // The blank-line lookahead exists so the block's OWN blank line (before
    // the disclosure) is absorbed. It must not become a licence to reach past
    // any blank line: here the next line is a numbered list the user wrote.
    const doc = `## Tool Guidance\n\n${RESOURCE_PRIORITY_BEGIN}\n\n1. My own hand-written step\n2. Another hand-written step\n\n## Instructions\n\nBe brief.\n`;
    const bounds = findPriorityBlock(doc);
    expect(bounds?.orphan).toBe(true);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(RESOURCE_PRIORITY_BEGIN);

    const repaired = splicePriorityBlock(doc, BLOCK);
    expect(repaired).toContain("1. My own hand-written step");
    expect(repaired).toContain("2. Another hand-written step");
  });

  it("stops at a blank line the document simply ends after", () => {
    // Lookahead off the end of the document: nothing follows, so nothing is
    // recognized, so the walk stops rather than running past the end.
    const doc = `${RESOURCE_PRIORITY_BEGIN}\n### Resource priorities\n1. stale line\n`;
    const bounds = findPriorityBlock(doc);
    expect(doc.slice(bounds!.start, bounds!.end)).toBe(
      `${RESOURCE_PRIORITY_BEGIN}\n### Resource priorities\n1. stale line`
    );
  });

  it("repairs an orphaned current-format block in a CRLF document", () => {
    const orphaned = [
      "## Tool Guidance",
      "",
      BLOCK.replace(`\n${RESOURCE_PRIORITY_END}`, ""),
      "",
      "Always cite the passage reference before quoting.",
      "",
    ]
      .join("\n")
      .replace(/\n/g, "\r\n");

    expect(findPriorityBlock(orphaned)?.orphan).toBe(true);

    const repaired = splicePriorityBlock(orphaned, BLOCK);
    expect(repaired.split(RESOURCE_PRIORITY_BEGIN)).toHaveLength(2);
    expect(repaired.split(RESOURCE_PRIORITY_END)).toHaveLength(2);
    expect(repaired.split(DISCLOSURE_TEXT.replace(/\n/g, "\r\n"))).toHaveLength(
      2
    );
    expect(repaired).toContain(
      "Always cite the passage reference before quoting."
    );
    // Still CRLF throughout — every LF is half of a pair.
    expect(repaired.split("\n")).toHaveLength(repaired.split("\r\n").length);
    expect(splicePriorityBlock(repaired, BLOCK)).toBe(repaired);
  });

  it("still absorbs generated list lines once a block body line was seen", () => {
    const doc = `## Tool Guidance\n\n${RESOURCE_PRIORITY_BEGIN}\n### Resource priorities\n1. stale generated line\n\nKeep me.\n\n## Instructions\n\nBe brief.\n`;
    const repaired = splicePriorityBlock(doc, BLOCK);
    expect(repaired).not.toContain("stale generated line");
    expect(repaired).toContain("Keep me.");
  });
});

describe("isOfferedBlockRefresh", () => {
  // Apply live, nothing reordered, block readable, and a block to write.
  function refresh(overrides: Partial<OfferedRefreshInput> = {}) {
    return isOfferedBlockRefresh({
      applyEnabled: true,
      hasApplyError: false,
      userReordered: false,
      storedOrderIsCorrupt: false,
      blockToWrite: BLOCK,
      ...overrides,
    });
  }

  it("recognizes a genuine untouched refresh", () => {
    expect(refresh()).toBe(true);
  });

  it("says nothing when Apply is blocked", () => {
    expect(refresh({ applyEnabled: false })).toBe(false);
  });

  it("says nothing while a failed apply is still being reported", () => {
    // That banner is the one asking for the user's attention.
    expect(refresh({ hasApplyError: true })).toBe(false);
  });

  it("says nothing once the user has reordered", () => {
    // Then Apply means what it usually means, and needs no explaining.
    expect(refresh({ userReordered: true })).toBe(false);
  });

  it("says nothing over a corrupt block", () => {
    // The unreadable order line reads as an empty order, so this apply would
    // REMOVE the block. The panel is already showing the red "we couldn't read
    // the saved ordering" notice; a calm "your ranking is unchanged" beside it
    // would talk a user into clicking through and losing a ranking they would
    // otherwise have retyped.
    expect(refresh({ storedOrderIsCorrupt: true })).toBe(false);
    expect(refresh({ storedOrderIsCorrupt: true, blockToWrite: "" })).toBe(
      false
    );
  });

  it("says nothing when the apply would write no block at all", () => {
    // Empty block = removal, whatever led to it. Independent of the
    // corruption check on purpose: either one alone must be disqualifying.
    expect(refresh({ blockToWrite: "" })).toBe(false);
  });

  it("still holds when only the descriptions have drifted", () => {
    // A post-#281 block already carries the disclosure, so the delta here is a
    // description rewrite. It is still order-preserving, so the panel may say
    // so — which is exactly why the copy describes the whole delta instead of
    // naming the disclosure as the reason.
    const drifted = generatePriorityBlock(
      ORDER,
      byId([
        entry(ULT.id, "unfoldingWord Literal Text (2026 revision)", "uW"),
        STUDY_NOTES,
      ])
    );
    expect(drifted).toContain(DISCLOSURE_TEXT);
    expect(drifted).not.toBe(BLOCK);
    expect(refresh({ blockToWrite: drifted })).toBe(true);
  });
});

describe("priorityLengthVerdict", () => {
  const under = "x".repeat(MAX_MODE_DOCUMENT_LENGTH);
  const over = "x".repeat(MAX_MODE_DOCUMENT_LENGTH + 1);

  it("passes a document that fits, edited or not", () => {
    // The limit itself fits — upstream rejects above it, not at it. (Nothing
    // in this repo enforces it; the constant is a preflight mirror of the
    // engine's limit, so the panel can refuse before a save comes back 400.)
    expect(under).toHaveLength(MAX_MODE_DOCUMENT_LENGTH);
    expect(priorityLengthVerdict(under, true)).toBe("ok");
    expect(priorityLengthVerdict(under, false)).toBe("ok");
  });

  it("blames the ranking when the user actually made one", () => {
    expect(priorityLengthVerdict(over, true)).toBe("over-from-edit");
  });

  it("does not blame an untouched panel for a document that arrives over", () => {
    // The regression this exists for: a large pre-#281 document is measured
    // against a block this version regenerates one paragraph longer, so it can
    // be over the limit the instant the panel opens. Telling that admin "this
    // ranking would push the document past the limit" names a ranking they did
    // not make and prescribes a fix that is not theirs to apply.
    expect(priorityLengthVerdict(over, false)).toBe("over-untouched");
  });

  it("separates the two verdicts on one and the same document", () => {
    expect(priorityLengthVerdict(over, false)).not.toBe(
      priorityLengthVerdict(over, true)
    );
  });
});
