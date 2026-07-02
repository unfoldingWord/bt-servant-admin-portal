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

// A future language rename would add the three language fields here
// (including the legacy `language_rights` bit, whose undefined-means-
// full semantics differ from modes — the expandRights passthrough is
// correct for it, but the consumer must decide how "*"-equivalent
// legacy users interact with per-slug migration). Deliberately not
// pre-declared: no consumer exists yet, and an unused constant would
// assert semantics nobody has validated.
export type RightsField = (typeof MODE_RIGHTS_FIELDS)[number];

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

// The unit contract and compensate operate on: which FIELDS of which
// user the expand actually modified. Per-field (not per-user) recording
// is load-bearing: a user can hold a legitimate pre-existing grant on
// the new slug in one field (say publish on "conversation") while the
// expand only touched the other (edit gained "conversation" alongside
// "spoken"). A per-user record would let compensation's partner-guard
// pass on the untouched field and strip the pre-existing grant.
export interface MigrationRecord {
  key: string;
  fields: RightsField[];
}

// Apply a per-field transform to a user record. Mutates in place;
// returns the fields that changed.
function applyToUser(
  user: StoredUser,
  fields: readonly RightsField[],
  transform: (rights: LanguageRights | undefined) => string[] | null
): RightsField[] {
  const changed: RightsField[] = [];
  for (const field of fields) {
    const next = transform(user[field]);
    if (next !== null) {
      user[field] = next;
      changed.push(field);
    }
  }
  return changed;
}

// Enumerate every `user:` key. AUTH_KV has no org index — same paginated
// scan as worker/admin.ts listUsers. Fine at current org sizes; if user
// counts ever approach the Workers subrequest cap, an org index is the
// fix, not a smarter scan (flagged in #240's design notes).
async function listUserKeys(env: Env): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.AUTH_KV.list({ prefix: "user:", cursor });
    keys.push(...list.keys.map((k) => k.name));
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return keys;
}

// Phase 1: add `newSlug` alongside `oldSlug` for every affected user in
// `org`. Each record is re-read immediately before its write (read →
// transform → put per key), so a concurrent admin edit to the same user
// is only at risk during a single key's read-write gap — not the whole
// scan duration. KV has no CAS; two truly simultaneous writes to one
// user remain last-write-wins (accepted at current scale, #240 design
// question 2).
//
// Returns records of the users/fields actually modified — contract and
// compensate operate ONLY on those fields, so a user who legitimately
// held BOTH slugs before the rename (or held the new slug in a field
// the expand didn't touch) is never affected by cleanup.
//
// Throws if any write fails, AFTER attempting to compensate the writes
// that did land — the caller must abort the rename (the engine call
// hasn't happened yet, so the old slug is still live and untouched).
export async function expandOrgModeRights(
  env: Env,
  org: string,
  oldSlug: string,
  newSlug: string
): Promise<MigrationRecord[]> {
  const keys = await listUserKeys(env);

  const results = await Promise.allSettled(
    keys.map(async (key): Promise<MigrationRecord | null> => {
      const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
      if (!user || user.org !== org) return null;
      const fields = applyToUser(user, MODE_RIGHTS_FIELDS, (r) =>
        expandRights(r, oldSlug, newSlug)
      );
      if (fields.length === 0) return null;
      await env.AUTH_KV.put(key, JSON.stringify(user));
      return { key, fields };
    })
  );

  const written: MigrationRecord[] = [];
  let failed = false;
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value) written.push(result.value);
    } else {
      failed = true;
    }
  }

  if (failed) {
    // Partial expand — roll back what landed so the caller can abort
    // with a clean store. (A rejected entry may have failed on the read
    // OR the put; either way its user is untouched or unrecorded, and
    // unrecorded-but-written is impossible since the put is the last
    // step.) If the rollback itself also fails, affected users hold an
    // extra entry for a slug that doesn't exist (the engine was never
    // called): no live access changes, but a future mode created with
    // that slug would inherit accidental shepherds — hence the loud log.
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

// Phases 3a/3b: remove `removeSlug` (keeping `keepSlug`) from exactly
// the fields recorded by the expand. Best-effort by design — by the
// time this runs, the engine outcome is settled and every affected user
// already holds the live slug, so a failed removal only leaves a
// harmless stale entry (logged, never surfaced to the caller as an
// error).
export async function contractOrgModeRights(
  env: Env,
  records: MigrationRecord[],
  removeSlug: string,
  keepSlug: string
): Promise<void> {
  await Promise.all(
    records.map(async ({ key, fields }) => {
      try {
        const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
        if (!user) return;
        const changed = applyToUser(user, fields, (r) =>
          removeSlugIfPartnerPresent(r, removeSlug, keepSlug)
        );
        if (changed.length > 0) {
          await env.AUTH_KV.put(key, JSON.stringify(user));
        }
      } catch (err) {
        console.error(
          `rights-migration: cleanup failed for ${key} (remove "${removeSlug}", keep "${keepSlug}") — stale entry remains`,
          err
        );
      }
    })
  );
}
