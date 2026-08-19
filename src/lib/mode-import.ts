// Pure parser for the Modes page's "Import Config" action (#198) — the exact
// inverse of `mode-export.ts`. Takes the Markdown-with-YAML-frontmatter file
// produced by `buildModeExportContent` and returns a validated shape ready to
// map onto the mode PUT body. Kept pure (no React, no I/O) so every parse and
// rejection path is unit-testable, mirroring the sibling gate/lib extractions.
//
// It reverses `mode-export`'s emitter, not an arbitrary YAML document: the
// frontmatter keys, the always-double-quoted scalars, and the block-form
// `aliases` list are all known. It is lenient about hand-edits a human might
// make (extra whitespace, unquoted scalars, CRLF line endings, unknown keys
// from a future export) but strict where ambiguity would corrupt data.

import { MODE_EXPORT_VERSION } from "./mode-export";
import { slugifyModeName } from "./mode-slug";

export interface ParsedModeImport {
  name: string;
  label?: string;
  description?: string;
  document: string;
  /** Always resolved to a definite boolean — an absent key means false. */
  published: boolean;
  /** Always resolved to a definite boolean — an absent key means false. */
  requires_group: boolean;
  /**
   * Aliases present in the file that this import will NOT restore. The mode
   * PUT contract has no `aliases` field (they are managed only through
   * `_rename`/`_retire`), so a round-trip drops them. Surfaced so the UI can
   * warn instead of silently losing them.
   */
  droppedAliases: string[];
}

export type ModeImportResult =
  | { ok: true; mode: ParsedModeImport }
  | { ok: false; error: string };

const FRONTMATTER_FENCE = "---";

/**
 * Parse an exported mode file. Returns a discriminated result rather than
 * throwing so the caller can render the message inline.
 */
export function parseModeImport(raw: string): ModeImportResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "The file is empty." };
  }

  // Tolerate a UTF-8 BOM and CRLF/CR line endings from editors/OSes.
  const normalized = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  // The first non-blank line must be the opening fence.
  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") start++;
  if (lines[start] !== FRONTMATTER_FENCE) {
    return {
      ok: false,
      error:
        "Not a recognized mode export — the file must start with a '---' frontmatter block.",
    };
  }

  // Find the closing fence.
  let closing = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === FRONTMATTER_FENCE) {
      closing = i;
      break;
    }
  }
  if (closing === -1) {
    return {
      ok: false,
      error:
        "Malformed export — the frontmatter block is not closed with '---'.",
    };
  }

  const frontmatterLines = lines.slice(start + 1, closing);
  // The emitter writes exactly one blank line between the closing fence and
  // the document; drop it to recover the document verbatim (any blank lines
  // that are genuinely part of the document survive, because only ONE is
  // removed). Everything after is the document body.
  const bodyLines = lines.slice(closing + 1);
  if (bodyLines.length > 0 && bodyLines[0] === "") bodyLines.shift();
  const document = bodyLines.join("\n");

  const fields = parseFrontmatter(frontmatterLines);

  // export_version gates the whole parse: a file from a newer portal may use
  // a shape we don't understand, and a file with no version is not our export.
  const versionRaw = fields.scalars.export_version;
  if (versionRaw === undefined) {
    return {
      ok: false,
      error: "Not a recognized mode export — missing 'export_version'.",
    };
  }
  const version = Number(versionRaw);
  if (!Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      error: `Unrecognized export_version '${versionRaw}'.`,
    };
  }
  if (version > MODE_EXPORT_VERSION) {
    return {
      ok: false,
      error: `This file was exported by a newer version of the portal (export_version ${version}); update the portal to import it.`,
    };
  }

  const name = fields.scalars.name;
  if (name === undefined || name.trim() === "") {
    return {
      ok: false,
      error: "Not a recognized mode export — missing a mode 'name'.",
    };
  }
  // The name is PUT straight into the URL path; a non-slug (e.g. a hand-typed
  // "Spoken Mode") would either 400 at the engine or create a second row
  // beside the canonical slug. Reject anything that isn't already canonical
  // rather than silently reslugging behind the user's back.
  if (name !== slugifyModeName(name)) {
    return {
      ok: false,
      error: `Invalid mode name “${name}” — expected a slug like “${slugifyModeName(
        name
      )}”.`,
    };
  }

  // Flags default to false when absent, but a PRESENT value must be exactly
  // "true" or "false". Coercing anything else to false would let a typo
  // ("published: TRUE", "published: tru") silently unpublish an overwritten
  // mode — the parser presents its result as validated, so reject instead.
  const published = parseFlag(fields.scalars.published);
  if (published === null) {
    return {
      ok: false,
      error: `Invalid 'published' value “${fields.scalars.published}” — expected true or false.`,
    };
  }
  const requiresGroup = parseFlag(fields.scalars.requires_group);
  if (requiresGroup === null) {
    return {
      ok: false,
      error: `Invalid 'requires_group' value “${fields.scalars.requires_group}” — expected true or false.`,
    };
  }

  const mode: ParsedModeImport = {
    name,
    document,
    published,
    requires_group: requiresGroup,
    droppedAliases: fields.aliases,
  };
  if (fields.scalars.label !== undefined) mode.label = fields.scalars.label;
  if (fields.scalars.description !== undefined) {
    mode.description = fields.scalars.description;
  }

  return { ok: true, mode };
}

interface ParsedFrontmatter {
  scalars: Record<string, string>;
  aliases: string[];
}

function parseFrontmatter(frontmatterLines: string[]): ParsedFrontmatter {
  const scalars: Record<string, string> = {};
  const aliases: string[] = [];

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i];
    if (line === undefined || line.trim() === "") continue;

    const keyMatch = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]?(.*)$/.exec(line);
    if (!keyMatch) continue; // list items handled by their key; ignore stray lines

    const key = keyMatch[1];
    if (key === undefined) continue;
    const rawValue = keyMatch[2] ?? "";

    // Block-form list (`aliases:` with an empty value, followed by `  - x`).
    if (key === "aliases" && rawValue.trim() === "") {
      while (i + 1 < frontmatterLines.length) {
        const nextLine = frontmatterLines[i + 1];
        if (nextLine === undefined) break;
        const item = /^[ \t]+-[ \t]+(.*)$/.exec(nextLine);
        if (!item) break;
        aliases.push(parseScalar(item[1] ?? ""));
        i++;
      }
      continue;
    }

    scalars[key] = parseScalar(rawValue);
  }

  return { scalars, aliases };
}

/**
 * Parse a boolean flag scalar: absent → false (the documented default), the
 * exact strings "true"/"false" → their value, anything else → null (malformed,
 * the caller rejects).
 */
function parseFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

/**
 * Reverse of `mode-export`'s `yamlScalar`. A value the emitter wrote is always
 * double-quoted; unquote and unescape it. A hand-edited unquoted value is
 * returned trimmed as-is (covers `true`/`false`/numbers and plain text).
 */
function parseScalar(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return unescapeYaml(trimmed.slice(1, -1));
  }
  return trimmed;
}

function unescapeYaml(inner: string): string {
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === undefined) break;
    if (c === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next === "\\") {
        out += "\\";
        i++;
      } else if (next === '"') {
        out += '"';
        i++;
      } else if (next === "n") {
        out += "\n";
        i++;
      } else if (next === "r") {
        out += "\r";
        i++;
      } else if (next === "t") {
        out += "\t";
        i++;
      } else {
        // Unknown escape — keep the backslash literally rather than guessing.
        out += c;
      }
    } else {
      out += c;
    }
  }
  return out;
}
