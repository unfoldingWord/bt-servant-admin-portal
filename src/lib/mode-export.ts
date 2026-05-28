// Pure helpers for the Modes page's "Export Config" action (#187).
// Produces a structured Markdown snapshot of a mode — YAML frontmatter
// for metadata, the mode's document as the body. Format is human-readable
// and round-trips through any standard Markdown-with-frontmatter parser.
// Import path is intentionally out of scope (separate issue per #187 ACs).

import type { PromptMode } from "@/types/prompt-override";

export const MODE_EXPORT_VERSION = 1;

export interface ModeExportContext {
  org: string;
  exportedAt: Date;
}

export function buildModeExportContent(
  mode: PromptMode,
  ctx: ModeExportContext
): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${yamlScalar(mode.name)}`);
  if (mode.label !== undefined) {
    lines.push(`label: ${yamlScalar(mode.label)}`);
  }
  if (mode.description !== undefined) {
    lines.push(`description: ${yamlScalar(mode.description)}`);
  }
  lines.push(`published: ${mode.published === true ? "true" : "false"}`);
  lines.push(`org: ${yamlScalar(ctx.org)}`);
  lines.push(`exported_at: ${ctx.exportedAt.toISOString()}`);
  lines.push(`export_version: ${MODE_EXPORT_VERSION}`);
  lines.push("---");
  lines.push("");
  lines.push(mode.document);
  return lines.join("\n");
}

export function buildModeExportFilename(
  mode: PromptMode,
  ctx: ModeExportContext
): string {
  const ts = ctx.exportedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${sanitize(ctx.org)}-mode-${sanitize(mode.name)}-${ts}.md`;
}

// YAML scalar emitter. Always double-quotes user-controlled strings so
// any colon, hash, leading dash, or other YAML special character can't
// produce a surprise parse on re-import. Escapes \, ", \n, \r, \t.
function yamlScalar(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

function sanitize(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "untitled";
}
