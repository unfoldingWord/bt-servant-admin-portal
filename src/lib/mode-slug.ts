// Canonical mode-slug normalization, shared by the create and rename
// flows (moved out of mode-selector for #260 so the modes page can
// compare labels against slugs): lowercase, spaces → hyphens, drop
// anything outside [a-z0-9-_], trim leading/trailing hyphens. The
// engine validates the result again server-side.
export function slugifyModeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/^-+|-+$/g, "");
}

// Best-effort display name suggested from a slug (#260): the post-rename
// "update display name to match?" prompt prefills with this. Word
// casing is lossy for acronyms ("fia" → "Fia"), which is why the prompt
// renders it in an editable input rather than applying it silently.
export function humanizeModeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
