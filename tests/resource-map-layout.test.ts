import { describe, expect, it } from "vitest";

import {
  MAP,
  ORG_NAME_MAX_CHARS,
  SERVER_CAPTION_MAX_CHARS,
  SERVER_NAME_MAX_CHARS,
  buildResourceMapLayout,
  serverCaption,
} from "../src/lib/resource-map-layout";
import { displayColumns, truncateLabel } from "../src/lib/truncate";
import type {
  AggregatedResourcesResponse,
  ResourceItem,
  ResourceServerReport,
  ResourceServerStatus,
} from "../src/types/resources";

function server(
  serverId: string,
  status: ResourceServerStatus = "ok",
  error?: string
): ResourceServerReport {
  return { serverId, serverName: `${serverId} server`, status, error };
}

function item(serverId: string, subject: string, name: string): ResourceItem {
  return { serverId, subject, name };
}

function response(
  servers: ResourceServerReport[],
  resources: Record<string, ResourceItem[]> = {},
  org = "uw"
): AggregatedResourcesResponse {
  return { org, language: "en", servers, resources };
}

describe("truncateLabel", () => {
  it("returns strings at or under the limit unchanged", () => {
    expect(truncateLabel("short", 10)).toBe("short");
    expect(truncateLabel("exactly-10", 10)).toBe("exactly-10");
  });

  it("truncates over-limit strings to max chars ending in an ellipsis", () => {
    const out = truncateLabel("a very long resource subject label", 12);
    expect(out).toHaveLength(12);
    expect(out.endsWith("…")).toBe(true);
  });

  it("trims trailing whitespace before the ellipsis", () => {
    // Slicing "abcd efgh" at 6 chars lands on the space — "abcd …" would
    // read as a typo.
    expect(truncateLabel("abcd efgh", 6)).toBe("abcd…");
  });

  it("truncates a wide label that fits on a code-point count but not on ink", () => {
    // 20 emoji is 20 code points but ~40 Latin columns of ink, so a 28-column
    // node cannot hold it. Budgeting by code point would pass it through
    // unchanged and let the text overflow its fixed-width node.
    const emoji = "🌍".repeat(20);
    const out = truncateLabel(emoji, 28);

    expect(out).not.toBe(emoji);
    expect(out.endsWith("…")).toBe(true);
    expect(displayColumns(out)).toBeLessThanOrEqual(28);
    // Still surrogate-safe: the cut lands on a code point boundary.
    for (const char of out) {
      const code = char.codePointAt(0) ?? 0;
      expect(code >= 0xd800 && code <= 0xdfff).toBe(false);
    }
  });

  it("spends two columns per wide glyph when cutting", () => {
    const out = truncateLabel("🌍".repeat(20), 10);

    // 9 columns of budget after the ellipsis = 4 emoji (8 columns); a 5th
    // would overrun.
    expect(Array.from(out)).toHaveLength(5);
    expect(out).toBe("🌍🌍🌍🌍…");
    expect(displayColumns(out)).toBeLessThanOrEqual(10);
  });

  it("is byte-for-byte unchanged for plain Latin labels", () => {
    // Columns and characters coincide for narrow text, so the column budget
    // must not perturb the overwhelmingly common case.
    expect(truncateLabel("a very long resource subject label", 12)).toBe(
      "a very long…"
    );
    expect(truncateLabel("abcd efgh", 6)).toBe("abcd…");
    expect(truncateLabel("exactly-10", 10)).toBe("exactly-10");
  });
});

describe("displayColumns", () => {
  it("counts an astral glyph as two Latin columns", () => {
    expect(displayColumns("🌍🌍🌍")).toBe(6);
  });

  it("counts CJK and fullwidth text as two columns per glyph", () => {
    expect(displayColumns("漢字")).toBe(4);
    expect(displayColumns("ＡＢ")).toBe(4);
  });

  it("matches String.length for plain BMP text", () => {
    expect(displayColumns("Bible Translations")).toBe(
      "Bible Translations".length
    );
    expect(displayColumns("")).toBe(0);
  });
});

describe("buildResourceMapLayout", () => {
  it("lays out an org-only map when no servers are connected", () => {
    const layout = buildResourceMapLayout(response([]));
    expect(layout.servers).toEqual([]);
    expect(layout.orgCenterY).toBe(MAP.padY + MAP.org.height / 2);
    expect(layout.height).toBe(MAP.padY * 2 + MAP.org.height);
  });

  it("rolls up per-server subject counts in response key order, omitting zero-count subjects", () => {
    const layout = buildResourceMapLayout(
      response([server("a"), server("b")], {
        bible: [item("a", "bible", "ult"), item("b", "bible", "niv")],
        "study-notes": [
          item("a", "study-notes", "sn1"),
          item("a", "study-notes", "sn2"),
        ],
        dictionary: [item("b", "dictionary", "tw")],
      })
    );

    const a = layout.servers[0]!;
    const b = layout.servers[1]!;
    expect(a.leaves.map((l) => [l.slug, l.count])).toEqual([
      ["bible", 1],
      ["study-notes", 2],
    ]);
    expect(b.leaves.map((l) => [l.slug, l.count])).toEqual([
      ["bible", 1],
      ["dictionary", 1],
    ]);
    expect(a.resourceCount).toBe(3);
    expect(b.resourceCount).toBe(2);
  });

  it("keeps leaves data-driven: attributed items surface even on a non-ok server, none are invented for unsupported ones", () => {
    const layout = buildResourceMapLayout(
      response(
        [server("fia", "unsupported"), server("flaky", "error", "boom")],
        { bible: [item("flaky", "bible", "cached")] }
      )
    );

    const fia = layout.servers[0]!;
    const flaky = layout.servers[1]!;
    expect(fia.leaves).toEqual([]);
    expect(fia.resourceCount).toBe(0);
    expect(flaky.leaves.map((l) => l.slug)).toEqual(["bible"]);
    expect(flaky.error).toBe("boom");
  });

  it("sizes a server block to its leaves span when leaves outgrow the node", () => {
    const layout = buildResourceMapLayout(
      response([server("a")], {
        bible: [item("a", "bible", "r1")],
        dictionary: [item("a", "dictionary", "r2")],
        media: [item("a", "media", "r3")],
      })
    );

    const a = layout.servers[0]!;
    const leavesSpan = 3 * MAP.leaf.height + 2 * MAP.leaf.gap;
    expect(leavesSpan).toBeGreaterThan(MAP.server.height);
    expect(a.height).toBe(leavesSpan);
    expect(a.centerY).toBe(a.top + a.height / 2);
    // Leaves are vertically centered on the block: first leaf top == block top.
    expect(a.leaves[0]!.y).toBe(a.top);
    expect(a.leaves[2]!.y + MAP.leaf.height).toBe(a.top + a.height);
  });

  it("keeps a leafless server block at node height", () => {
    const layout = buildResourceMapLayout(response([server("a")]));
    expect(layout.servers[0]!.height).toBe(MAP.server.height);
  });

  it("stacks server blocks in input order with the block gap", () => {
    const layout = buildResourceMapLayout(
      response([server("z"), server("a"), server("m")])
    );

    expect(layout.servers.map((s) => s.serverId)).toEqual(["z", "a", "m"]);
    const first = layout.servers[0]!;
    const second = layout.servers[1]!;
    const third = layout.servers[2]!;
    expect(second.top).toBe(first.top + first.height + MAP.blockGap);
    expect(third.top).toBe(second.top + second.height + MAP.blockGap);
    expect(layout.height).toBe(third.top + third.height + MAP.padY);
  });

  it("centers the org node between the first and last server centers", () => {
    const layout = buildResourceMapLayout(
      response([server("a"), server("b"), server("c")])
    );
    const { servers } = layout;
    expect(layout.orgCenterY).toBe(
      (servers[0]!.centerY + servers[2]!.centerY) / 2
    );
  });

  it("grows the viewport when the org node extends past a short server column", () => {
    // One leafless server: node height (54) is shorter than the org node
    // (58), so the org's bottom edge, not the server block, sets the height.
    const layout = buildResourceMapLayout(response([server("a")]));
    expect(layout.height).toBe(
      layout.orgCenterY + MAP.org.height / 2 + MAP.padY
    );
  });

  it("truncates leaf labels and widens chips with label length, within the viewport", () => {
    const longSubject =
      "an-extremely-long-subject-slug-that-keeps-going-and-going";
    const layout = buildResourceMapLayout(
      response([server("a")], {
        bible: [item("a", "bible", "r1")],
        [longSubject]: [item("a", longSubject, "r2")],
      })
    );

    const short = layout.servers[0]!.leaves[0]!;
    const long = layout.servers[0]!.leaves[1]!;
    expect(long.label.endsWith("…")).toBe(true);
    expect(long.label.length).toBeLessThanOrEqual(30);
    expect(long.width).toBeGreaterThan(short.width);
    expect(MAP.leaf.x + long.width).toBeLessThanOrEqual(MAP.width - 16);
  });

  it("keeps each leaf's full label beside the truncated one, so a cut chip can be titled", () => {
    const longSubject =
      "an-extremely-long-subject-slug-that-keeps-going-and-going";
    const layout = buildResourceMapLayout(
      response([server("a")], {
        bible: [item("a", "bible", "r1")],
        [longSubject]: [item("a", longSubject, "r2")],
      })
    );

    const short = layout.servers[0]!.leaves[0]!;
    const long = layout.servers[0]!.leaves[1]!;
    // Untruncated chips must compare equal, or every chip would draw a title.
    expect(short.label).toBe(short.fullLabel);
    expect(long.label).not.toBe(long.fullLabel);
    expect(long.fullLabel).toBe(
      "An Extremely Long Subject Slug That Keeps Going And Going"
    );
    expect(long.fullLabel.startsWith(long.label.slice(0, -1))).toBe(true);
  });
});

describe("serverCaption", () => {
  it("counts what a healthy server listed", () => {
    expect(serverCaption("ok", 3, "en").full).toBe("3 resources");
    expect(serverCaption("ok", 1, "en").full).toBe("1 resource");
  });

  it("names the language when a healthy server listed nothing", () => {
    expect(serverCaption("ok", 0, "sw").full).toBe("nothing listed for “sw”");
  });

  it("gives the reason alone when a degraded server contributed nothing", () => {
    expect(serverCaption("unsupported", 0, "en").full).toBe(
      "no resource listing"
    );
    expect(serverCaption("error", 0, "en").full).toBe("failed to respond");
  });

  it("acknowledges items a degraded server did contribute, so the caption never reads as failed-and-empty", () => {
    // The map still draws those leaves and the footer still totals them —
    // a bare "failed to respond" next to two visible leaves is a lie.
    expect(serverCaption("error", 2, "en").full).toBe(
      "failed to respond — 2 resources shown"
    );
    expect(serverCaption("unsupported", 1, "en").full).toBe(
      "no resource listing — 1 resource shown"
    );
  });
});

describe("serverCaption fits the fixed-width server node", () => {
  it("leaves a caption that already fits alone", () => {
    const caption = serverCaption("ok", 12, "en");
    expect(caption.full).toBe("12 resources");
    expect(caption.full.length).toBeLessThanOrEqual(SERVER_CAPTION_MAX_CHARS);
    // Equal forms are what tells the renderer not to draw a <title>.
    expect(caption.display).toBe(caption.full);
  });

  it("bounds the degraded-with-count caption and keeps the full text", () => {
    const caption = serverCaption("error", 128, "en");
    expect(caption.full).toBe("failed to respond — 128 resources shown");
    expect(caption.full.length).toBeGreaterThan(SERVER_CAPTION_MAX_CHARS);
    expect(caption.display).toHaveLength(SERVER_CAPTION_MAX_CHARS);
    expect(caption.display.endsWith("…")).toBe(true);
    // The drawn form is a genuine prefix of the full one, ellipsis aside.
    expect(caption.full.startsWith(caption.display.slice(0, -1))).toBe(true);
  });

  it("cuts a free-text language tag inside the quotes, not the sentence around it", () => {
    // The Resources filter takes a free IETF code, so arbitrary user text is
    // interpolated straight into this caption.
    const tag = "zh-Hant-TW-x-a-very-long-private-use-tag";
    const caption = serverCaption("ok", 0, tag);
    expect(caption.full).toBe(`nothing listed for “${tag}”`);
    expect(caption.display.length).toBeLessThanOrEqual(
      SERVER_CAPTION_MAX_CHARS
    );
    // What happened survives, and so does the closing quote — a tail cut of
    // the whole caption would have eaten both.
    expect(caption.display.startsWith("nothing listed for “")).toBe(true);
    expect(caption.display.endsWith("”")).toBe(true);
    expect(caption.display).toContain("…");
  });

  it("never lets a pathological tag outgrow the budget", () => {
    const caption = serverCaption("ok", 0, "x".repeat(500));
    expect(caption.display.length).toBeLessThanOrEqual(
      SERVER_CAPTION_MAX_CHARS
    );
    expect(caption.full).toHaveLength("nothing listed for “”".length + 500);
  });
});

describe("org node label", () => {
  it("passes a short org name through untouched", () => {
    const layout = buildResourceMapLayout(response([server("a")]));
    expect(layout.orgName).toBe("uw");
    expect(layout.orgDisplayName).toBe("uw");
  });

  it("truncates a long org slug to the fixed-width node's character budget", () => {
    const org = "an-extremely-long-organization-slug";
    const layout = buildResourceMapLayout(response([server("a")], {}, org));
    expect(layout.orgName).toBe(org);
    expect(layout.orgDisplayName).toHaveLength(ORG_NAME_MAX_CHARS);
    expect(layout.orgDisplayName.endsWith("…")).toBe(true);
  });
});

describe("leaf width for wide labels", () => {
  function leafWidthFor(slug: string): number {
    const layout = buildResourceMapLayout(
      response([server("a")], { [slug]: [item("a", slug, "x")] })
    );
    return layout.servers[0]!.leaves[0]!.width;
  }

  it("sizes a wide label by its ink, not by its code-point count", () => {
    // 5 emoji ≈ 10 Latin columns, so the node must be as wide as a 10-character
    // Latin label — which is exactly what the pre-round-1 UTF-16 estimate gave.
    // Code-point counting would have sized this like a 5-character label.
    expect(leafWidthFor("🌍🌍🌍🌍🌍")).toBe(leafWidthFor("abcdefghij"));
    expect(leafWidthFor("🌍🌍🌍🌍🌍")).toBeGreaterThan(leafWidthFor("abcde"));
  });

  it("leaves narrow labels at their established width", () => {
    // Pin the common case in absolute terms: a 5-character Latin label is
    // measured exactly as it was before the column budget landed.
    expect(leafWidthFor("abcde")).toBe(71);
  });
});

describe("buildResourceMapLayout server attribution", () => {
  // The map used to read `server.serverName` raw. It now goes through the same
  // buildServerNameMap/resolveServerName join as the Resources page and the
  // priority panel, so all three surfaces name a server identically.
  function named(serverId: string, serverName: string): ResourceServerReport {
    return { serverId, serverName, status: "ok" };
  }

  it("falls back to the server id when the report names the server blank", () => {
    const layout = buildResourceMapLayout(response([named("aquifer", "   ")]));

    expect(layout.servers[0]!.serverName).toBe("aquifer");
    expect(layout.servers[0]!.displayName).toBe("aquifer");
  });

  it("collapses control characters before they reach the sr-only tree", () => {
    // serverName is untrusted third-party text and lands in an SVG <title> and
    // the screen-reader list; it has to be one display line.
    const layout = buildResourceMapLayout(
      response([named("th", "Translation\nHelps\tMCP")])
    );

    expect(layout.servers[0]!.serverName).toBe("Translation Helps MCP");
  });

  it("keeps a well-formed name untouched", () => {
    const layout = buildResourceMapLayout(response([named("th", "Aquifer")]));

    expect(layout.servers[0]!.serverName).toBe("Aquifer");
    expect(layout.servers[0]!.displayName).toBe("Aquifer");
  });

  it("collapses an untrusted error string, which lands in the sr-only tree raw", () => {
    // `error` is the same untrusted class as serverName and is read straight
    // into the screen-reader list and the node <title>.
    const layout = buildResourceMapLayout(
      response([
        {
          serverId: "aquifer",
          serverName: "Aquifer",
          status: "error",
          error: "upstream 502\n\n  at handler\ttimeout",
        },
      ])
    );

    expect(layout.servers[0]!.error).toBe("upstream 502 at handler timeout");
  });

  it("leaves a missing error undefined rather than turning it into an empty string", () => {
    const layout = buildResourceMapLayout(response([named("a", "A")]));
    expect(layout.servers[0]!.error).toBeUndefined();
  });

  it("truncates a wide server name a code-point budget would have passed", () => {
    // The reported symptom: 20 emoji is 20 code points, under the 24 budget,
    // but ~40 columns of ink — it would have overflowed the fixed-width node.
    const wide = "🌍".repeat(20);
    const layout = buildResourceMapLayout(response([named("emoji", wide)]));
    const node = layout.servers[0]!;

    expect(node.serverName).toBe(wide);
    expect(node.displayName).not.toBe(wide);
    expect(node.displayName.endsWith("…")).toBe(true);
    expect(displayColumns(node.displayName)).toBeLessThanOrEqual(
      SERVER_NAME_MAX_CHARS
    );
  });

  it("truncates a long name for the node while keeping the full one", () => {
    const long = "The Exceedingly Verbose Translation Helps MCP Server";
    const layout = buildResourceMapLayout(response([named("th", long)]));

    expect(layout.servers[0]!.serverName).toBe(long);
    expect(layout.servers[0]!.displayName.endsWith("…")).toBe(true);
    expect(layout.servers[0]!.displayName.length).toBeLessThan(long.length);
  });
});
