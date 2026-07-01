// Canonical language/mode slug rule. Kept identical to what
// LanguageSelector and mode-selector shipped independently so a
// user typing "Arabic (MSA)" in any UI surface produces the same
// stored slug. The engine also lowercases + validates on receipt,
// so this is the client-side mirror.
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/^-+|-+$/g, "");
}
