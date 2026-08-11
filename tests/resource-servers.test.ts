import { describe, expect, it } from "vitest";

import {
  RESOURCE_SERVER_LABEL_MAX_CHARS,
  buildServerNameMap,
  resolveServerLabel,
  resolveServerName,
} from "../src/lib/resource-servers";
import type { ResourceServerReport } from "../src/types/resources";

function server(
  serverId: string,
  serverName: string,
  status: ResourceServerReport["status"] = "ok"
): ResourceServerReport {
  return { serverId, serverName, status };
}

describe("buildServerNameMap", () => {
  it("indexes the servers[] status block by id", () => {
    const names = buildServerNameMap([
      server("translation-helps", "Translation Helps"),
      server("aquifer", "Aquifer"),
    ]);

    expect(names.get("translation-helps")).toBe("Translation Helps");
    expect(names.get("aquifer")).toBe("Aquifer");
    expect(names.size).toBe(2);
  });

  it("indexes degraded servers too — attribution outlives a listing failure", () => {
    // A resource cached from an earlier aggregation still needs a name even
    // when its server is currently erroring or can't list.
    const names = buildServerNameMap([
      server("fia", "FIA", "unsupported"),
      server("aquifer", "Aquifer", "error"),
    ]);

    expect(names.get("fia")).toBe("FIA");
    expect(names.get("aquifer")).toBe("Aquifer");
  });

  it("omits blank and whitespace-only names rather than indexing an empty label", () => {
    const names = buildServerNameMap([
      server("blank", ""),
      server("spaces", "   \t  "),
    ]);

    expect(names.has("blank")).toBe(false);
    expect(names.has("spaces")).toBe(false);
  });

  it("collapses newlines, tabs and invisible characters in untrusted names", () => {
    // serverName is third-party MCP output: it must render as one display line
    // and must not smuggle invisible structure into a chip.
    const names = buildServerNameMap([
      server("multiline", "Translation\nHelps\r\n  MCP"),
      server("zerowidth", "Aqui​fer‮"),
    ]);

    expect(names.get("multiline")).toBe("Translation Helps MCP");
    expect(names.get("zerowidth")).toBe("Aqui fer");
  });

  it("returns an empty map for an empty status block", () => {
    expect(buildServerNameMap([]).size).toBe(0);
  });
});

describe("resolveServerName", () => {
  const names = buildServerNameMap([server("aquifer", "Aquifer")]);

  it("prefers the human-readable name", () => {
    expect(resolveServerName("aquifer", names)).toBe("Aquifer");
  });

  it("falls back to the machine id for a server missing from servers[]", () => {
    // Off-contract but observable: a server can list resources and then drop
    // out of a later aggregation. The raw id beats showing no attribution.
    expect(resolveServerName("ubs-handbooks", names)).toBe("ubs-handbooks");
  });

  it("collapses an untrusted id used as the fallback", () => {
    expect(resolveServerName("we\nird", names)).toBe("we ird");
  });
});

describe("resolveServerLabel", () => {
  const names = buildServerNameMap([
    server("aquifer", "Aquifer"),
    server("th", "Translation Helps"),
  ]);

  it("renders the name and keeps the machine id in the tooltip", () => {
    const label = resolveServerLabel("th", names);

    expect(label.display).toBe("Translation Helps");
    expect(label.full).toBe("Translation Helps");
    expect(label.title).toBe("Translation Helps (th)");
  });

  it("does not repeat the id in the tooltip when it equals the name", () => {
    const idOnly = buildServerNameMap([]);
    expect(resolveServerLabel("aquifer", idOnly).title).toBe("aquifer");
  });

  it("bounds an unbounded untrusted name to the character budget", () => {
    const long = "A".repeat(400);
    const label = resolveServerLabel(
      "bloated",
      buildServerNameMap([server("bloated", long)])
    );

    expect(label.display.length).toBeLessThanOrEqual(
      RESOURCE_SERVER_LABEL_MAX_CHARS
    );
    expect(label.display.endsWith("…")).toBe(true);
    // The full name still reaches the tooltip — truncation is display-only.
    expect(label.full).toBe(long);
    expect(label.title).toContain(long);
  });

  it("honors an explicit budget", () => {
    const label = resolveServerLabel("th", names, 8);

    expect(label.display).toBe("Transla…");
    expect(label.display.length).toBe(8);
  });

  it("leaves a name exactly at the budget untruncated", () => {
    const exact = "B".repeat(RESOURCE_SERVER_LABEL_MAX_CHARS);
    const label = resolveServerLabel(
      "exact",
      buildServerNameMap([server("exact", exact)])
    );

    expect(label.display).toBe(exact);
  });

  it("bounds a name that is only long because of collapsed whitespace", () => {
    const label = resolveServerLabel(
      "spacey",
      buildServerNameMap([server("spacey", `Aquifer${" ".repeat(200)}MCP`)])
    );

    expect(label.full).toBe("Aquifer MCP");
  });
});
