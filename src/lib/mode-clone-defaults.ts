// Pure helpers for the Modes page's Clone dialog (#241 PR B). Kept
// separate from the component file so unit tests can import without
// pulling JSX config in, and so the react-refresh fast-refresh rule
// doesn't complain about a component file exporting non-component
// symbols.

// Pick a default new-slug for the clone dialog that doesn't collide
// with an existing mode's name in the org. First tries `${source}-copy`;
// if that's taken, walks `-copy-2`, `-copy-3`, ... until it finds a free
// slot. #241 PR B Frank F5 — a bare `${source}-copy` prefill guaranteed
// a 409 on the second clone of the same source since the first clone
// had already claimed that slug.
//
// Note: this uses the caller-provided list only; the engine also checks
// against aliases (Ian's #232 reconciliation §4), so a picked default
// can still 409 if a distinct mode carries the picked slug as an alias.
// That's acceptable — we're picking a sensible default, not enforcing
// uniqueness; the engine remains the source of truth and its message
// surfaces inline.
export function pickCloneDefaultSlug(
  source: string,
  existing: readonly string[]
): string {
  const taken = new Set(existing);
  const base = `${source}-copy`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
