import type { Env } from "./helpers";
import type { LanguageRights, StoredUser } from "./types";

// #240 — per-user rights migration for slug-changing mode ops.
//
// Per-user mode rights (`mode_edit_rights` / `mode_publish_rights`) are
// arrays of mode SLUGS. The engine's `_rename` op reslugs a mode in
// place; without migration, every shepherd holding rights on the old
// slug is stranded (the worker gate matches the exact slug string —
// aliases are deliberately not consulted, see gateConfigMutation).
//
// ## Atomicity model: expand → engine op → contract
//
// KV has no transactions and the engine is a remote call, so true
// atomicity is unavailable. Instead the migration holds one invariant
// at every intermediate point: a user's rights always cover whichever
// slug is currently live.
//
//   1. EXPAND  — add the new slug to every affected user (old kept).
//   2. ENGINE  — call `_rename`.
//   3a. CONTRACT   (engine 2xx)     — remove the old slug.
//   3b. COMPENSATE (engine non-2xx) — remove the new slug.
//
// A crash or write failure at any point leaves affected users with a
// SUPERSET of their correct rights, never less: after a failed engine
// call they still hold the old (live) slug; after a successful rename
// they hold the new (live) slug plus at worst a stale old entry, which
// is inert (the old slug survives only as an alias, and nothing in the
// authz path reads aliases). Contrast with migrate-then-rename, whose
// failed rollback leaves users pointing ONLY at a slug that doesn't
// exist — locked out.
//
// The removal primitive is shared by contract and compensate: it never
// removes a slug unless its partner is present in the same array, so a
// removal can never shrink a user's rights below the live slug.
//
// ## Scope / reuse
//
// The pure helpers are field-agnostic; `MODE_RIGHTS_FIELDS` /
// `LANGUAGE_RIGHTS_FIELDS` parameterize the kind so future consumers
// (retire-and-forward rights inheritance, clone auto-grant, language
// rename) reuse the same primitives. Only the mode-rename orchestration
// is wired up today (#240 scope).

export const MODE_RIGHTS_FIELDS = [
  "mode_edit_rights",
  "mode_publish_rights",
] as const satisfies readonly (keyof StoredUser)[];

// Includes the legacy single-bit field: a future language rename must
// migrate it too, since `rightsFor` falls back to it when the verb
// fields are unset.
export const LANGUAGE_RIGHTS_FIELDS = [
  "language_edit_rights",
  "language_publish_rights",
  "language_rights",
] as const satisfies readonly (keyof StoredUser)[];

export type RightsField =
  | (typeof MODE_RIGHTS_FIELDS)[number]
  | (typeof LANGUAGE_RIGHTS_FIELDS)[number];

// Add `to` wherever `from` is held. `"*"` and `undefined` pass through
// untouched — wildcard resolves at gate time and needs no entry; for
// modes `undefined` means no access (nothing to widen), and for the
// legacy language field it means full access (same as wildcard).
// Returns the new array, or null when no change is needed (from absent,
// or to already present).
export function expandRights(
  rights: LanguageRights | undefined,
  from: string,
  to: string
): string[] | null {
  if (rights === undefined || rights === "*") return null;
  if (!rights.includes(from)) return null;
  if (rights.includes(to)) return null;
  return [...rights, to].sort();
}

// Remove `remove` — but ONLY when `keep` is present in the same array.
// This single guard is what makes contract and compensate safe to run
// against any intermediate state: the removal can never take away a
// user's only path to the live slug.
//   contract   = removeSlugIfPartnerPresent(rights, oldSlug, newSlug)
//   compensate = removeSlugIfPartnerPresent(rights, newSlug, oldSlug)
// Returns the new array, or null when no change is needed.
export function removeSlugIfPartnerPresent(
  rights: LanguageRights | undefined,
  remove: string,
  keep: string
): string[] | null {
  if (rights === undefined || rights === "*") return null;
  if (!rights.includes(remove)) return null;
  if (!rights.includes(keep)) return null;
  return rights.filter((slug) => slug !== remove);
}

// Apply a per-field transform to a user record. Mutates in place;
// returns true when any field changed.
function applyToUser(
  user: StoredUser,
  fields: readonly RightsField[],
  transform: (rights: LanguageRights | undefined) => string[] | null
): boolean {
  let changed = false;
  for (const field of fields) {
    const next = transform(user[field]);
    if (next !== null) {
      user[field] = next;
      changed = true;
    }
  }
  return changed;
}

// Enumerate every stored user in `org`. AUTH_KV has no org index — this
// mirrors the listUsers scan in worker/admin.ts (full `user:` prefix,
// filter by `.org` in code). Fine at current org sizes; if user counts
// grow enough to hurt, an org index is the fix, not a smarter scan.
async function listOrgUsers(
  env: Env,
  org: string
): Promise<{ key: string; user: StoredUser }[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.AUTH_KV.list({ prefix: "user:", cursor });
    keys.push(...list.keys.map((k) => k.name));
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  const entries = await Promise.all(
    keys.map(async (key) => {
      const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
      if (!user || user.org !== org) return null;
      return { key, user };
    })
  );
  return entries.filter((e): e is { key: string; user: StoredUser } => !!e);
}

// Phase 1: add `newSlug` alongside `oldSlug` for every affected user in
// `org`. Returns the KV keys of the users actually modified — contract
// and compensate operate ONLY on this set, so a user who legitimately
// held BOTH slugs before the rename is never touched by the cleanup
// phases (compensating them would strip a pre-existing grant).
//
// Throws if any write fails, AFTER attempting to compensate the writes
// that did land — the caller should abort the rename (the engine call
// hasn't happened yet, so the old slug is still live and untouched).
export async function expandOrgModeRights(
  env: Env,
  org: string,
  oldSlug: string,
  newSlug: string
): Promise<string[]> {
  const entries = await listOrgUsers(env, org);
  const affected = entries.filter(({ user }) =>
    applyToUser(user, MODE_RIGHTS_FIELDS, (r) =>
      expandRights(r, oldSlug, newSlug)
    )
  );
  if (affected.length === 0) return [];

  const results = await Promise.allSettled(
    affected.map(({ key, user }) => env.AUTH_KV.put(key, JSON.stringify(user)))
  );
  const written = affected
    .filter((_, i) => results[i]?.status === "fulfilled")
    .map(({ key }) => key);

  if (written.length < affected.length) {
    // Partial expand — roll back what landed so the caller can abort
    // with a clean store. If the rollback itself also fails, affected
    // users hold an extra entry for a slug that doesn't exist (the
    // engine was never called): no live access changes, but a future
    // mode created with that slug would inherit accidental shepherds —
    // hence the loud log.
    await contractOrgModeRights(env, written, newSlug, oldSlug).catch((err) =>
      console.error(
        `rights-migration: rollback after partial expand failed (org=${org}, ${oldSlug}→${newSlug}); stale "${newSlug}" entries may remain`,
        err
      )
    );
    throw new Error("rights migration failed: could not update all users");
  }
  return written;
}

// Phases 3a/3b: remove `removeSlug` (keeping `keepSlug`) from the users
// expanded in phase 1. Best-effort by design — by the time this runs,
// the engine outcome is settled and every affected user already holds
// the live slug, so a failed removal only leaves a harmless stale entry
// (logged, never surfaced to the caller as an error).
export async function contractOrgModeRights(
  env: Env,
  userKeys: string[],
  removeSlug: string,
  keepSlug: string
): Promise<void> {
  await Promise.all(
    userKeys.map(async (key) => {
      try {
        const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
        if (!user) return;
        const changed = applyToUser(user, MODE_RIGHTS_FIELDS, (r) =>
          removeSlugIfPartnerPresent(r, removeSlug, keepSlug)
        );
        if (changed) await env.AUTH_KV.put(key, JSON.stringify(user));
      } catch (err) {
        console.error(
          `rights-migration: cleanup failed for ${key} (remove "${removeSlug}", keep "${keepSlug}") — stale entry remains`,
          err
        );
      }
    })
  );
}
