// The two notice styles the Modes sheets share (details, resource priorities).
// One home so a tone or padding change lands in every sheet at once; before
// this the strings were byte-identical copies across both panels.

/** Muted, informational: read-only notes, blocks the user must resolve elsewhere. */
export const MUTED_NOTICE_CLASS =
  "bg-muted/40 text-muted-foreground border-border rounded-r-md border-l-2 px-3 py-2 text-xs leading-relaxed";

/** Destructive: a save that failed. */
export const DESTRUCTIVE_NOTICE_CLASS =
  "bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2 text-xs";
