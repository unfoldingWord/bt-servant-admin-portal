// The two notice styles the Modes sheets share (details, resource priorities).
// One home so a tone or padding change lands in both sheets at once; before
// this the strings were near-identical copies across the two panels (one
// site gained `leading-relaxed` in the merge; a site that needs its own
// padding layers it over the shared class with `cn()`). The languages
// editor keeps its own strings.

/** Muted, informational: read-only notes, blocks the user must resolve elsewhere. */
export const MUTED_NOTICE_CLASS =
  "bg-muted/40 text-muted-foreground border-border rounded-r-md border-l-2 px-3 py-2 text-xs leading-relaxed";

/** Destructive: a save that failed. */
export const DESTRUCTIVE_NOTICE_CLASS =
  "bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2 text-xs";
