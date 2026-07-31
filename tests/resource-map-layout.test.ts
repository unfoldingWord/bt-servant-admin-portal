import { describe, expect, it } from "vitest";

import {
  MAP,
  buildResourceMapLayout,
  truncateLabel,
} from "../src/lib/resource-map-layout";
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
  resources: Record<string, ResourceItem[]> = {}
): AggregatedResourcesResponse {
  return { org: "uw", language: "en", servers, resources };
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
});
