import { describe, expect, it } from "vitest";

import {
  MODE_EXPORT_VERSION,
  buildModeExportContent,
} from "../src/lib/mode-export";
import { parseModeImport } from "../src/lib/mode-import";
import type { PromptMode } from "../src/types/prompt-override";

const FIXED_DATE = new Date("2026-05-28T15:30:00.000Z");

function exported(mode: PromptMode, org = "unfoldingWord"): string {
  return buildModeExportContent(mode, { org, exportedAt: FIXED_DATE });
}

describe("parseModeImport — round-trip with mode-export", () => {
  it("recovers every supported field from a fully-populated export", () => {
    const mode: PromptMode = {
      name: "spoken",
      label: "Spoken Mode",
      description: "Conversational responses tuned for spoken delivery.",
      document: "# Spoken mode\n\nUse natural prose.\n\n## Closing\n\nBye.",
      published: true,
      requires_group: true,
    };
    const result = parseModeImport(exported(mode));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.name).toBe("spoken");
    expect(result.mode.label).toBe("Spoken Mode");
    expect(result.mode.description).toBe(
      "Conversational responses tuned for spoken delivery."
    );
    expect(result.mode.document).toBe(mode.document);
    expect(result.mode.published).toBe(true);
    expect(result.mode.requires_group).toBe(true);
    expect(result.mode.droppedAliases).toEqual([]);
  });

  it("round-trips a minimal mode (name + document only)", () => {
    const mode: PromptMode = { name: "minimal", document: "body only" };
    const result = parseModeImport(exported(mode));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.name).toBe("minimal");
    expect(result.mode.label).toBeUndefined();
    expect(result.mode.description).toBeUndefined();
    expect(result.mode.document).toBe("body only");
    // Absent keys resolve to definite false, matching the always-explicit
    // pair the page sends on save.
    expect(result.mode.published).toBe(false);
    expect(result.mode.requires_group).toBe(false);
  });

  it("preserves document content that itself begins with a blank line", () => {
    const mode: PromptMode = { name: "m", document: "\n\nleading blanks kept" };
    const result = parseModeImport(exported(mode));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.document).toBe("\n\nleading blanks kept");
  });

  it("round-trips escaped characters in metadata (quotes, newlines, backslash)", () => {
    const mode: PromptMode = {
      name: "tricky",
      label: 'Has "quotes" and\ttabs',
      description: "Line one\nLine two with a \\ backslash",
      document: "doc",
      published: false,
    };
    const result = parseModeImport(exported(mode));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.label).toBe('Has "quotes" and\ttabs');
    expect(result.mode.description).toBe(
      "Line one\nLine two with a \\ backslash"
    );
  });
});

describe("parseModeImport — aliases", () => {
  it("surfaces exported aliases as droppedAliases (PUT can't restore them)", () => {
    const mode: PromptMode = {
      name: "spoken",
      document: "doc",
      aliases: ["spoken-old", "spoken-legacy"],
    };
    const result = parseModeImport(exported(mode));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.droppedAliases).toEqual(["spoken-old", "spoken-legacy"]);
  });
});

describe("parseModeImport — tolerant of hand-edits", () => {
  it("accepts CRLF line endings", () => {
    const crlf = exported({ name: "m", document: "a\nb", published: true })
      .split("\n")
      .join("\r\n");
    const result = parseModeImport(crlf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.document).toBe("a\nb");
    expect(result.mode.published).toBe(true);
  });

  it("accepts a leading UTF-8 BOM", () => {
    const result = parseModeImport(
      "﻿" + exported({ name: "m", document: "d" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.name).toBe("m");
  });

  it("ignores unknown future keys without failing", () => {
    const withExtra = exported({ name: "m", document: "d" }).replace(
      "export_version:",
      "some_future_key: hello\nexport_version:"
    );
    const result = parseModeImport(withExtra);
    expect(result.ok).toBe(true);
  });

  it("accepts an unquoted scalar value", () => {
    const raw = [
      "---",
      "name: plain",
      "published: false",
      "export_version: 1",
      "---",
      "",
      "doc",
    ].join("\n");
    const result = parseModeImport(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode.name).toBe("plain");
  });
});

describe("parseModeImport — rejections", () => {
  it("rejects an empty file", () => {
    expect(parseModeImport("")).toEqual({
      ok: false,
      error: "The file is empty.",
    });
  });

  it("rejects a file without a frontmatter fence", () => {
    const result = parseModeImport("# Just a markdown doc\n\nno frontmatter");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("must start with a '---'");
  });

  it("rejects an unclosed frontmatter block", () => {
    const result = parseModeImport("---\nname: x\nexport_version: 1\nbody");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not closed");
  });

  it("rejects a file with no export_version", () => {
    const raw = ["---", 'name: "x"', "---", "", "body"].join("\n");
    const result = parseModeImport(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing 'export_version'");
  });

  it("rejects a file with no name", () => {
    const raw = ["---", "export_version: 1", "---", "", "body"].join("\n");
    const result = parseModeImport(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing a mode 'name'");
  });

  it("rejects an export from a newer portal version", () => {
    const raw = [
      "---",
      'name: "x"',
      `export_version: ${MODE_EXPORT_VERSION + 1}`,
      "---",
      "",
      "body",
    ].join("\n");
    const result = parseModeImport(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("newer version");
  });
});
