import { describe, expect, it } from "vitest";

import {
  MODE_EXPORT_VERSION,
  buildModeExportContent,
  buildModeExportFilename,
} from "../src/lib/mode-export";
import type { PromptMode } from "../src/types/prompt-override";

const FIXED_DATE = new Date("2026-05-28T15:30:00.000Z");

const baseMode: PromptMode = {
  name: "spoken",
  label: "Spoken Mode",
  description: "Conversational responses tuned for spoken delivery.",
  document: "# Spoken mode\n\nUse natural prose.",
  published: true,
};

describe("buildModeExportContent — frontmatter", () => {
  it("emits all PromptMode fields when populated", () => {
    const out = buildModeExportContent(baseMode, {
      org: "unfoldingWord",
      exportedAt: FIXED_DATE,
    });
    expect(out).toContain('name: "spoken"');
    expect(out).toContain('label: "Spoken Mode"');
    expect(out).toContain(
      'description: "Conversational responses tuned for spoken delivery."'
    );
    expect(out).toContain("published: true");
    expect(out).toContain('org: "unfoldingWord"');
    expect(out).toContain("exported_at: 2026-05-28T15:30:00.000Z");
    expect(out).toContain(`export_version: ${MODE_EXPORT_VERSION}`);
  });

  it("omits optional fields that are undefined", () => {
    const out = buildModeExportContent(
      { name: "minimal", document: "body" },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).not.toContain("label:");
    expect(out).not.toContain("description:");
    // `published` is always emitted (boolean defaults to false when undefined).
    expect(out).toContain("published: false");
  });

  it("emits an aliases block when the mode carries aliases", () => {
    const out = buildModeExportContent(
      { ...baseMode, aliases: ["spoken-old", "spoken-legacy"] },
      { org: "unfoldingWord", exportedAt: FIXED_DATE }
    );
    expect(out).toContain('aliases:\n  - "spoken-old"\n  - "spoken-legacy"');
  });

  it("omits the aliases key entirely when the mode has no aliases", () => {
    const withoutKey = buildModeExportContent(baseMode, {
      org: "uW",
      exportedAt: FIXED_DATE,
    });
    const withEmpty = buildModeExportContent(
      { ...baseMode, aliases: [] },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    // Engine omits `aliases` when empty; mirror that so round-tripped
    // files don't sprout an empty key on subsequent exports.
    expect(withoutKey).not.toContain("aliases");
    expect(withEmpty).not.toContain("aliases");
  });

  it("escapes alias slugs through the same YAML scalar emitter as other strings", () => {
    const out = buildModeExportContent(
      { ...baseMode, aliases: ['weird "quoted"', "back\\slash"] },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain('  - "weird \\"quoted\\""');
    expect(out).toContain('  - "back\\\\slash"');
  });

  it("emits published as the literal boolean — false when undefined or false", () => {
    const undef = buildModeExportContent(
      { name: "x", document: "" },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    const explicit = buildModeExportContent(
      { name: "x", document: "", published: false },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(undef).toContain("published: false");
    expect(explicit).toContain("published: false");
  });

  it("wraps frontmatter in the standard --- fences", () => {
    const out = buildModeExportContent(baseMode, {
      org: "unfoldingWord",
      exportedAt: FIXED_DATE,
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe("---");
    const closingIdx = lines.indexOf("---", 1);
    expect(closingIdx).toBeGreaterThan(0);
    // Blank line separates frontmatter from body.
    expect(lines[closingIdx + 1]).toBe("");
  });

  it("appends the document verbatim after the frontmatter", () => {
    const out = buildModeExportContent(baseMode, {
      org: "unfoldingWord",
      exportedAt: FIXED_DATE,
    });
    expect(out.endsWith(baseMode.document)).toBe(true);
  });
});

describe("buildModeExportContent — YAML escaping", () => {
  it("escapes double quotes inside string values", () => {
    const out = buildModeExportContent(
      { name: "x", label: 'has "quotes" here', document: "" },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain('label: "has \\"quotes\\" here"');
  });

  it("escapes backslashes", () => {
    const out = buildModeExportContent(
      { name: "x", label: "C:\\path\\to\\thing", document: "" },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain('label: "C:\\\\path\\\\to\\\\thing"');
  });

  it("escapes newlines, carriage returns, and tabs in metadata strings", () => {
    const out = buildModeExportContent(
      { name: "x", description: "line1\nline2\rline3\twith-tab", document: "" },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain('description: "line1\\nline2\\rline3\\twith-tab"');
  });

  it("survives YAML special characters that would break unquoted scalars", () => {
    const out = buildModeExportContent(
      {
        name: "x",
        label: "value: with: colons # and hash & ampersand",
        document: "",
      },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain(
      'label: "value: with: colons # and hash & ampersand"'
    );
  });

  it("leaves the document body unescaped (it's the markdown payload)", () => {
    const docWithSpecials = '# Heading\n\n"quoted text"\n\n```\ncode\n```';
    const out = buildModeExportContent(
      { name: "x", document: docWithSpecials },
      { org: "uW", exportedAt: FIXED_DATE }
    );
    expect(out).toContain(docWithSpecials);
  });
});

describe("buildModeExportFilename", () => {
  it("uses the {org}-mode-{name}-{ts}.md pattern", () => {
    expect(
      buildModeExportFilename(baseMode, {
        org: "unfoldingWord",
        exportedAt: FIXED_DATE,
      })
    ).toBe("unfoldingWord-mode-spoken-20260528T153000Z.md");
  });

  it("sanitizes filesystem-unsafe characters and trims leading/trailing underscores", () => {
    expect(
      buildModeExportFilename(
        { name: "mode/with slashes & spaces", document: "" },
        { org: "weird org!", exportedAt: FIXED_DATE }
      )
    ).toBe("weird_org-mode-mode_with_slashes___spaces-20260528T153000Z.md");
  });

  it("falls back to 'untitled' if sanitization eats every character", () => {
    expect(
      buildModeExportFilename(
        { name: "✨", document: "" },
        { org: "🙂", exportedAt: FIXED_DATE }
      )
    ).toBe("untitled-mode-untitled-20260528T153000Z.md");
  });

  it("produces ISO-derived timestamps with no separators (sortable)", () => {
    // Two close-together exports sort lexicographically in time order.
    const earlier = buildModeExportFilename(baseMode, {
      org: "uW",
      exportedAt: new Date("2026-05-28T15:30:00.000Z"),
    });
    const later = buildModeExportFilename(baseMode, {
      org: "uW",
      exportedAt: new Date("2026-05-28T15:30:01.000Z"),
    });
    expect(earlier < later).toBe(true);
  });
});
