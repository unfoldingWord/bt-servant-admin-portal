import type { Env } from "./helpers";
import { listKvKeys } from "./helpers";
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

// A future language rename would add the legacy `language_rights` bit
// here too (its undefined-means-full semantics differ from modes — the
// expandRights passthrough is correct for it, but the consumer must
// decide how "*"-equivalent legacy users interact with per-slug
// migration). The two VERB fields below are declared because the #247
// bootstrap auto-grant consumes them; the legacy field stays
// undeclared until a rename consumer validates its semantics.
export type RightsField = (typeof MODE_RIGHTS_FIELDS)[number];

export const LANGUAGE_VERB_RIGHTS_FIELDS = [
  "language_edit_rights",
  "language_publish_rights",
] as const satisfies readonly (keyof StoredUser)[];

export type LanguageVerbRightsField =
  (typeof LANGUAGE_VERB_RIGHTS_FIELDS)[number];

// Add `to` wherever `from` is held. `"*"` and `undefined` pass through
// untouched — wildcard resolves at gate time and needs no entry; for
// modes `undefined` means no access (nothing to widen), and for the
// legacy language field it means full access (same as wildcard).
// Returns the new array, or null when no change is needed (from absent,
// or to already present). Appends WITHOUT sorting: expand+compensate on
// a failed rename must be write-neutral, and a sort would permanently
// reorder arrays for an operation that did nothing (rd-3 review).
export function expandRights(
  rights: LanguageRights | undefined,
  from: string,
  to: string
): string[] | null {
  if (rights === undefined || rights === "*") return null;
  if (!rights.includes(from)) return null;
  if (rights.includes(to)) return null;
  return [...rights, to];
}

// #247 bootstrap auto-grant transform — add `slug` to one verb field.
// `explicit` is the field's stored value; `legacyFallback` is the
// user's legacy `language_rights`, consulted only when the field is
// unset (mirroring the lazy-migration rule in worker/auth.ts). When
// the grant fires against a fallback-derived array, the explicit field
// is materialized with the fallback's entries plus the new slug — the
// same materialization validateSession performs at read time.
// Returns the new array, or null when no write is needed (effective
// rights are full — undefined/"*" — or already include the slug).
export function grantSlug(
  explicit: LanguageRights | undefined,
  legacyFallback: LanguageRights | undefined,
  slug: string
): string[] | null {
  const effective = explicit ?? legacyFallback;
  if (effective === undefined || effective === "*") return null;
  if (effective.includes(slug)) return null;
  return [...effective, slug];
}

// #247 — grant the creator both language verbs on a just-bootstrapped
// slug. Follows the #240 expand-first model: the caller invokes this
// BEFORE the engine create, so a crash between grant and create leaves
// the user with an entry for a slug that doesn't exist — inert, and in
// this case the "accidental shepherd" a future same-slug language would
// inherit is the admin who was allowed to create it anyway. Throws on
// read/write failure — the caller must abort the create (nothing has
// touched the engine yet).
//
// Returns the fields actually modified, so definitive-failure
// compensation operates only on what this grant touched and can never
// strip a pre-existing entry (per-field recording, same rationale as
// MigrationRecord).
export async function grantLanguageSlugToUser(
  env: Env,
  email: string,
  slug: string
): Promise<LanguageVerbRightsField[]> {
  const key = `user:${email}`;
  const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
  if (!user) {
    throw new Error(`bootstrap grant: no stored user for ${key}`);
  }
  const changed: LanguageVerbRightsField[] = [];
  for (const field of LANGUAGE_VERB_RIGHTS_FIELDS) {
    const next = grantSlug(user[field], user.language_rights, slug);
    if (next !== null) {
      user[field] = next;
      changed.push(field);
    }
  }
  if (changed.length > 0) {
    await env.AUTH_KV.put(key, JSON.stringify(user));
  }
  return changed;
}

// #247 — compensate a bootstrap grant after a DEFINITIVE engine
// rejection of the create (4xx). Best-effort by design, like
// contractOrgModeRights: a failed removal leaves a harmless inert
// entry (logged). Operates only on the fields the grant recorded.
export async function revokeLanguageSlugFromUser(
  env: Env,
  email: string,
  slug: string,
  fields: LanguageVerbRightsField[]
): Promise<void> {
  const key = `user:${email}`;
  try {
    const user = await env.AUTH_KV.get<StoredUser>(key, { type: "json" });
    if (!user) return;
    let dirty = false;
    for (const field of fields) {
      const rights = user[field];
      if (rights !== undefined && rights !== "*" && rights.includes(slug)) {
        user[field] = rights.filter((s) => s !== slug);
        dirty = true;
      }
    }
    if (dirty) {
      await env.AUTH_KV.put(key, JSON.stringify(user));
    }
  } catch (err) {
    console.error(
      `rights-migration: bootstrap grant compensation failed for ${key} (slug "${slug}") — stale entry remains`,
      err
    );
  }
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
  const keys = await listKvKeys(env.AUTH_KV, "user:");

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
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      if (result.value) written.push(result.value);
    } else {
      failed = true;
      // Name the key and reason — the only evidence an operator gets
      // when diagnosing a production KV failure via cf-logs (rd-3
      // review: this was the one failure branch with zero diagnostics).
      console.error(
        `rights-migration: expand failed for ${keys[i]} (org=${org}, ${oldSlug}→${newSlug})`,
        result.reason
      );
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
