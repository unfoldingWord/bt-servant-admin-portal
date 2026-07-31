// Pure helpers for the mode boolean-flag pair (`published`,
// `requires_group`) that every mode PUT must carry (#209).
//
// The worker's mode PUT has no partial-update path: a body always carries
// the full document, and each omitted scalar key falls back to the STORED
// value (`incoming.published ?? existing.published`, worker
// `mergeExistingMode`). An explicit `false` is therefore the only way to
// turn either flag off — which means every save path, including the ones
// that conceptually touch only one flag (Publish, the group-chat toggle),
// re-asserts BOTH. Two flag writes that overlap would each carry the
// other's pre-flight value and the loser would clobber the winner, so the
// page keeps the pair as ONE value that only ever moves together.
//
// The worker echoes the merged mode back on every PUT
// (`{ org, mode: toMarkdownView(savedMode) }`), including `published` and
// `requires_group` — its `compactOptional` filter drops `undefined` and
// `""` but keeps `false`. That response is server truth, so it is what the
// local trackers re-anchor on rather than assuming the write landed
// exactly as sent.

import type { PromptMode } from "@/types/prompt-override";

export interface ModeFlags {
  published: boolean;
  requires_group: boolean;
}

/** Flags for a mode with neither key set (and for "nothing selected"). */
export const DEFAULT_MODE_FLAGS: ModeFlags = {
  published: false,
  requires_group: false,
};

type ModeFlagSource = Partial<
  Pick<PromptMode, "published" | "requires_group">
> | null;

/**
 * Read the flag pair off a server mode payload, coercing absent keys to
 * `false`. Absent and `false` are semantically identical on the wire for
 * both flags; the portal works in plain booleans so it can always send
 * them explicitly.
 */
export function readModeFlags(mode: ModeFlagSource | undefined): ModeFlags {
  return {
    published: mode?.published ?? false,
    requires_group: mode?.requires_group ?? false,
  };
}

/**
 * Re-anchor the locally-tracked flag pair after a successful PUT.
 *
 * `saved` is the mode the worker echoed back (post-merge server truth) and
 * wins per key when present. A key the worker omitted means the stored
 * value is `undefined`, only reachable by never having set that flag — so
 * fall back to what we sent, which is what the merge just stored.
 *
 * `??` (not `||`) is load-bearing: a server-echoed `false` has to survive
 * against a sent `true`, which is exactly the disagreement this
 * reconciliation exists to catch.
 */
export function reconcileModeFlags(
  sent: ModeFlags,
  saved: ModeFlagSource | undefined
): ModeFlags {
  return {
    published: saved?.published ?? sent.published,
    requires_group: saved?.requires_group ?? sent.requires_group,
  };
}
