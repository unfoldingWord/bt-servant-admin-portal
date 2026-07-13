import type { Env } from "./helpers";
import { errorResponse, isPathShapedOrg } from "./helpers";
import {
  contractOrgModeRights,
  expandOrgModeRights,
  grantLanguageSlugToUser,
  revokeLanguageSlugFromUser,
  type LanguageVerbRightsField,
  type MigrationRecord,
} from "./rights-migration";
import type { LanguageRights, SessionData } from "./types";

// `undefined` is the back-compat default for users predating the rights
// system (and for fields the worker hasn't lazy-migrated into yet — see
// worker/auth.ts) — treated as full access. Same rule on the client
// (src/lib/permissions.ts) so the UI matches the BFF gate.
function hasRights(rights: LanguageRights | undefined, name: string): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.includes(name);
}

type ResourceKind = "language" | "mode";
type RightsVerb = "edit" | "publish";

function rightsFor(
  session: SessionData,
  kind: ResourceKind,
  verb: RightsVerb
): LanguageRights | undefined {
  if (kind === "language") {
    const explicit =
      verb === "edit"
        ? session.language_edit_rights
        : session.language_publish_rights;
    if (explicit !== undefined) return explicit;
    // Partner-aware deny: if the OTHER verb is explicit, this verb's
    // unset state is a deliberate gap, not legacy-full. Without this,
    // an admin who grants `language_edit_rights = ["spanish"]` and
    // leaves `language_publish_rights` unset would silently give the
    // user full publish access (undefined → legacy full via the
    // pre-#181 hasRights rule) — the opposite of what the dialog UI
    // signals. Only when BOTH verbs are unset do we fall back to the
    // legacy `language_rights` bit (worker/auth.ts lazy migration
    // mirror — preserves access for pre-#181 shepherds until they're
    // re-saved through the new dialog).
    const partner =
      verb === "edit"
        ? session.language_publish_rights
        : session.language_edit_rights;
    if (partner !== undefined) return [];
    return session.language_rights;
  }
  // Modes: returning `undefined` here would translate to "legacy full
  // access" via hasRights — same partner-aware footgun. The mode-
  // baseline gate above catches the truly-legacy (both undefined) case
  // and returns 403; everywhere downstream, `undefined` for one mode
  // verb means "no rights for this verb," not legacy full.
  const own =
    verb === "edit" ? session.mode_edit_rights : session.mode_publish_rights;
  return own ?? [];
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Proxy helper — forwards request to Engine API
// ---------------------------------------------------------------------------

async function proxyToEngine(
  request: Request,
  env: Env,
  enginePath: string,
  allowedMethods: string[],
  // Optional pre-parsed body. The verb-perms gate consumes the body to
  // diff against current state; passing it back in here avoids a
  // double-read (request bodies are one-shot streams).
  parsedBody?: unknown
): Promise<Response> {
  if (!allowedMethods.includes(request.method)) {
    return errorResponse("Method not allowed", 405);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.ENGINE_API_KEY}`,
  };

  let body: string | undefined;
  if (request.method === "PUT" || request.method === "POST") {
    headers["Content-Type"] = "application/json";
    if (parsedBody !== undefined) {
      body = JSON.stringify(parsedBody);
    } else {
      try {
        body = JSON.stringify(await request.json());
      } catch {
        return errorResponse("Invalid JSON", 400);
      }
    }
  }

  const engineRes = await fetch(`${env.ENGINE_BASE_URL}${enginePath}`, {
    method: request.method,
    headers,
    body,
  });

  // Pass through the engine response as-is
  return new Response(engineRes.body, {
    status: engineRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Verb-perms gate (#181) — language + mode PUT/DELETE authorization
// ---------------------------------------------------------------------------

// PUT body shape we diff against current state. Both languages and modes
// share `document` and `published`; modes additionally carry `label` and
// `description`. We treat any of those three editorial fields as an edit
// signal so a future `{label: "new"}` PUT for languages stays on the edit
// gate even though today's portal only sends `document`.
interface ResourceShape {
  // Canonical slug from the engine's admin view. The rename arm's
  // preflights compare it against URL/body slugs — the engine resolves
  // slugs through aliases (findModeBySlug honors aliases, engine #284),
  // so the addressed slug and the mode's canonical name can differ.
  name?: string;
  document?: string;
  label?: string;
  description?: string;
  published?: boolean;
}

// Tri-state resource lookup — the single copy of the engine GET +
// envelope unwrap (rd-4 review: the preflights and the PUT gate's
// current-state read had drifted into near-duplicates of it). Callers
// layer their own error semantics on top.
//
// Deliberately does NOT catch: a thrown fetch (network) or a malformed
// 2xx body (json parse) PROPAGATES. The PUT gate has always let those
// surface as a request failure — swallowing them here would widen its
// creation-semantics fallback and let an edit-only shepherd unpublish a
// live mode during an engine blip (rd-5 review). preflightMode adds its
// own catch to map throws to fail-closed "error".
type ResourceState =
  | { status: "found"; mode: ResourceShape }
  | { status: "missing" }
  | { status: "error" };

async function fetchResourceState(
  env: Env,
  kind: ResourceKind,
  org: string,
  name: string
): Promise<ResourceState> {
  // Takes the RAW org and encodes here (#253 review): callers used to
  // disagree — the rename preflights passed the pre-encoded handleConfig
  // local while gateConfigMutation passed raw resolved.org, so a
  // slash-named org's PUT gate looked up /orgs/team/alpha/... and the
  // engine's 404 silently rerouted the mutation to creation semantics.
  const enginePath =
    kind === "language"
      ? `/api/v1/admin/orgs/${encodeURIComponent(org)}/languages/${encodeURIComponent(name)}`
      : `/api/v1/admin/orgs/${encodeURIComponent(org)}/modes/${encodeURIComponent(name)}`;
  const res = await fetch(`${env.ENGINE_BASE_URL}${enginePath}`, {
    headers: { Authorization: `Bearer ${env.ENGINE_API_KEY}` },
  });
  if (res.status === 404) return { status: "missing" };
  if (!res.ok) return { status: "error" };
  const data = (await res.json()) as Record<string, unknown>;
  // Engine wraps in { org, language|mode: {...} } — mirror of the
  // unwrap logic in src/lib/languages-api.ts + src/lib/config-api.ts.
  const wrapped = kind === "language" ? data.language : data.mode;
  const mode =
    wrapped && typeof wrapped === "object"
      ? (wrapped as ResourceShape)
      : (data as ResourceShape);
  return { status: "found", mode };
}

// Preflight lookup for the rename arm. Unlike the PUT gate's current-
// state read (whose error-collapses-to-null is deliberately lax — the
// gate falls through to stricter creation semantics), the preflights
// are SECURITY checks and must fail CLOSED: a transient engine 5xx during the
// collision check must abort the rename, not read as "slug is free"
// and reopen the escalation window it guards (rd-3 review). A found
// mode whose payload lacks a string `name` is treated as an error for
// the same reason — the canonical-name comparisons are the checks, and
// a response-shape drift must disable the rename, not the guards
// (rd-4 review). Distinguishing 404 from other failures also keeps the
// error contract honest — "missing" is the only case reported as 404.
type ModePreflight =
  | { status: "found"; mode: ResourceShape & { name: string } }
  | { status: "missing" }
  | { status: "error" };

async function preflightMode(
  env: Env,
  org: string,
  name: string
): Promise<ModePreflight> {
  let state: ResourceState;
  try {
    state = await fetchResourceState(env, "mode", org, name);
  } catch {
    return { status: "error" };
  }
  if (state.status !== "found") return state;
  if (typeof state.mode.name !== "string") return { status: "error" };
  return {
    status: "found",
    mode: state.mode as ResourceShape & { name: string },
  };
}

// Diff a PUT body against current engine state to determine which verb
// rights the caller needs. The portal sends the full resource on every
// PUT — document and published both present even for an autosave that
// only changed the document — so naive presence-based intent doesn't
// work. We compare values to compute the actual diff.
//
// Creation case (`current === null`): treat any editorial field as an
// edit, and only require publish if `published: true` is being set
// (since the engine's create-default is unpublished).
function computeRequiredVerbsForPut(
  body: ResourceShape,
  current: ResourceShape | null
): RightsVerb[] {
  const isCreate = current === null;
  // Engine rows predating the `published` field may omit it on read.
  // Coerce undefined → false so an edit-only autosave that sends
  // `published: false` against such a row doesn't spuriously demand
  // publish rights (false !== undefined would otherwise trigger).
  const currentPublished = current?.published ?? false;
  const docChanged =
    body.document !== undefined &&
    (isCreate || body.document !== current.document);
  const labelChanged =
    body.label !== undefined && (isCreate || body.label !== current.label);
  const descChanged =
    body.description !== undefined &&
    (isCreate || body.description !== current.description);
  const publishChanged =
    body.published !== undefined &&
    (isCreate ? body.published === true : body.published !== currentPublished);

  const verbs: RightsVerb[] = [];
  if (docChanged || labelChanged || descChanged) verbs.push("edit");
  if (publishChanged) verbs.push("publish");
  return verbs;
}

// Authorization gate for PUT/DELETE on /api/config/{languages,modes}/{name}.
// Returns `{ ok: true }` to proceed (with optional `parsedBody` when the
// gate already consumed it), or `{ error: Response }` to reject.
//
// Order of checks (intentionally asymmetric language ↔ mode):
//   1. crossOrg (super-admin viewing another org's config) — bypass
//      per-row gates; shepherd rights are home-org-scoped and don't
//      translate. Same carve-out as the pre-#181 language gate.
//   2. hasAdminPowers — bypasses the gate FOR MODES ONLY. Pre-#181 the
//      mode path was admin-only and languages were per-row for everyone
//      (PR #185 review explicitly assertion: same-org super-admin with
//      restricted `language_rights` still gets 403 on unauthorized
//      langs). Preserve that asymmetry — admin doesn't trump per-row
//      languages, only modes.
//   3. Mode-baseline gate (modes only) — non-admin with both
//      mode_*_rights unset → 403, preserving pre-#181 admin-only for
//      legacy users. Escape by admin-granting at least one explicit
//      mode verb in the new dialog.
//   4. Early-deny — if the caller has zero rights on this row across
//      both verbs, reject before consuming the body. Keeps bodyless
//      probes (DELETE, GET-with-method-override, malformed PUTs) on
//      the 403 path rather than a downstream 400. Same-org-admin
//      language PUTs are exempted — they fall through to check 6,
//      whose #247 carve-out must see them.
//   5. DELETE → requires BOTH edit + publish on the row. Deletion is
//      strictly more destructive than either alone.
//   6. PUT → diff body vs current and require the union of verbs the
//      diff implies (`edit` if any editorial field changed, `publish`
//      if the published flag flipped). When the diff denies, one
//      carve-out (#247): a same-org admin's language PUT is allowed IF
//      the engine CONFIRMED the target doesn't exist — pure creation.
//      Without it, an org whose users all hold explicit (non-"*")
//      language rights can never create its FIRST draft: rights can
//      only name drafts that exist, and creating a draft requires
//      rights — a deadlock. The carve-out sits on the deny path of the
//      diff (not inside check 4) so mixed shapes like edit=[] +
//      publish="*" — which pass the zero-rights screen on one verb yet
//      still fail creation's edit demand — reach it too. It fails
//      CLOSED (found or probe-error → 403) and never applies to DELETE
//      or existing rows, so the PR #185 "admin doesn't trump per-row
//      languages" rule holds for everything that already exists. The
//      caller pairs it with an auto-grant of both verbs to the creator
//      (rights-migration.ts).
async function gateConfigMutation(
  request: Request,
  env: Env,
  session: SessionData,
  org: string,
  kind: ResourceKind,
  name: string,
  crossOrg: boolean
): Promise<
  | { ok: true; parsedBody?: ResourceShape; adminBootstrapCreate?: boolean }
  | { error: Response }
> {
  if (crossOrg) return { ok: true };

  // Admin trumps PER-MODE rights only. Pre-#181, modes were admin-only
  // and languages were per-row for everyone — including super-admin
  // shepherds with restricted same-org `language_rights` (PR #185
  // review). Preserve that asymmetry: a same-org admin doesn't get a
  // free pass on a language they don't shepherd, but does keep the
  // legacy "admin can edit any mode" capability.
  if (kind === "mode" && hasAdminPowers(session)) return { ok: true };

  // Modes had no per-row rights pre-#181 — the gate was admin-only. The
  // "undefined === legacy full access" rule that languages inherit from
  // the original per-row `language_rights` field would silently widen
  // mode access to every non-admin if applied here. Keep the pre-#181
  // admin-only baseline for any non-admin without an explicit mode
  // grant; the new dialog must set at least one of mode_edit_rights /
  // mode_publish_rights to escape this baseline.
  if (
    kind === "mode" &&
    session.mode_edit_rights === undefined &&
    session.mode_publish_rights === undefined
  ) {
    return { error: errorResponse("Forbidden", 403) };
  }

  // #247 — the shape eligible for the bootstrap carve-out in the PUT
  // path below. Computed once: it also exempts these requests from the
  // early-deny, which would otherwise 403 the zero-rights-admin case
  // before the creation probe could run.
  const adminLanguageCreatePath =
    kind === "language" && request.method === "PUT" && hasAdminPowers(session);

  // Early-deny: if the caller has zero rights on this row across both
  // verbs, no PUT diff can let them through. Rejecting before reading
  // the body keeps the gate side-effect-free in the impossible case and
  // preserves the pre-#181 same-org "restricted shepherd → 403 on any
  // unauthorized row" behavior even for bodyless probes. Same-org-admin
  // language PUTs fall through instead — for them the PUT diff CAN
  // allow (creation via the #247 carve-out), at the cost of a body
  // parse + existence probe on what may still end as a 403.
  if (
    !adminLanguageCreatePath &&
    !hasRights(rightsFor(session, kind, "edit"), name) &&
    !hasRights(rightsFor(session, kind, "publish"), name)
  ) {
    return { error: errorResponse("Forbidden", 403) };
  }

  if (request.method === "DELETE") {
    if (
      !hasRights(rightsFor(session, kind, "edit"), name) ||
      !hasRights(rightsFor(session, kind, "publish"), name)
    ) {
      return { error: errorResponse("Forbidden", 403) };
    }
    return { ok: true };
  }

  if (request.method === "PUT") {
    let body: ResourceShape;
    try {
      body = (await request.json()) as ResourceShape;
    } catch {
      return { error: errorResponse("Invalid JSON", 400) };
    }
    // Tri-state lookup. A thrown fetch or malformed 2xx body PROPAGATES
    // and fails the request, exactly as on main (rd-5 review; pinned by
    // test) — do not add a catch here. An "error" status collapses to
    // null for the verb diff, treating the PUT as a creation, which is
    // conservative (every editorial field present demands edit;
    // published: true demands publish). The #247 carve-out is stricter:
    // it requires a CONFIRMED "missing", so an engine blip can tighten
    // the diff but can never widen admin creation onto an existing row.
    const state = await fetchResourceState(env, kind, org, name);
    const current = state.status === "found" ? state.mode : null;
    const denied = computeRequiredVerbsForPut(body, current).some(
      (verb) => !hasRights(rightsFor(session, kind, verb), name)
    );
    if (!denied) return { ok: true, parsedBody: body };
    // #247 bootstrap carve-out — see the gate's doc comment (check 6).
    // TOCTOU: a same-name create landing between the "missing" read and
    // the engine PUT means one admin's scaffold overwrites the other's
    // seconds-old scaffold — same-org, admin-only, and bounded to
    // brand-new drafts; accepted.
    if (adminLanguageCreatePath && state.status === "missing") {
      return { ok: true, parsedBody: body, adminBootstrapCreate: true };
    }
    return { error: errorResponse("Forbidden", 403) };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Config route handler
// ---------------------------------------------------------------------------

// "Has admin powers" — true for org admins AND for super admins. Mirrors
// the principle in worker/admin.ts that isSuperAdmin trumps isAdmin: a
// super admin who self-demoted isAdmin (allowed; they retain cross-org
// powers via super) still needs to be able to mutate prompt configuration,
// not just /api/admin/users. Without this, the super-admin partial-power
// state would be inconsistent across the worker.
function hasAdminPowers(session: SessionData): boolean {
  return session.isAdmin || (session.isSuperAdmin ?? false);
}

// Mutations on org-wide prompt-overrides are admin-only. The trusted-portal
// model (single shared ADMIN_API_TOKEN upstream, no per-user identity on
// admin paths) means this worker is the only enforcement point — without
// this gate, any authenticated user in the org could rewrite or delete the
// org's prompt-overrides via direct fetch. GET stays open because the
// payload carries no sensitive data beyond the org's prompt configuration.
//
// Modes used to share this gate but now have their own per-mode verb-perms
// gate (gateConfigMutation), so non-admin mode shepherds can edit/publish
// modes they hold rights on.
function isAdminMutation(method: string, session: SessionData): boolean {
  return (method === "PUT" || method === "DELETE") && !hasAdminPowers(session);
}

// Org targeting via ?org=<slug>.
//
// `?org=<caller's own org>` is semantically a same-org request for ANY
// caller, so it resolves like the param was absent (#247: the user
// dialogs always scope their language/mode list fetches to the target
// user's org, which for org admins is their own org — rejecting it
// broke those fetches with a 403 for every non-super-admin). The match
// is EXACT (post-trim), deliberately: org identity must mean one thing
// inside the worker, and worker/admin.ts compares orgs exactly. The
// portal only ever sends org values read back from stored records
// (session.org, user.org), so the strings are byte-identical on every
// legitimate same-org path; a case-variant is either a genuinely
// distinct org (KV keys are case-sensitive) or a probe, and both must
// stay loud/cross-org rather than silently retarget to session.org.
// (src/lib/language-bootstrap-gate.ts lowercases for CTA *wording* on
// free-text input — a display decision, not an authz one.)
//
// A different org stays super-admin only, and rejects loud rather
// than silently falling back to session.org so a UI bug or hostile
// probe surfaces visibly instead of masquerading as a same-org
// request.
//
// `crossOrg` reflects whether the resolved target differs from the
// caller's home org — not merely whether the param was present. A super
// admin sending `?org=<their own org>` is semantically a same-org
// request, so language_rights remain enforced. Without this discriminator
// a restricted-shepherd super admin could bypass their own org's
// language_rights by adding a self-referential `?org=` (Frank, PR #185
// review).
function resolveOrg(
  request: Request,
  session: SessionData
): { crossOrg: boolean; org: string } | { error: Response } {
  const orgParam = new URL(request.url).searchParams.get("org");

  // Slash-named orgs are addressable: org names are free-text (stored
  // values may predate admin.ts's shape guard), and every engine-URL
  // interpolation of the resolved org is encodeURIComponent'd (the
  // handleConfig local for proxy paths, fetchResourceState internally
  // for the gate's lookups), which neutralizes "/". Rejecting the shape
  // here would re-break the dialogs' list fetches (the #247 symptom)
  // for anyone operating on such an org.
  let resolved: { crossOrg: boolean; org: string };
  if (orgParam === null) {
    resolved = { crossOrg: false, org: session.org };
  } else {
    const trimmed = orgParam.trim();
    if (!trimmed) {
      return { error: errorResponse("Invalid org parameter", 400) };
    }
    if (trimmed === session.org.trim()) {
      // Trim BOTH sides: buildConfigUrl trims the param before sending,
      // so a legacy whitespace-padded stored org (" team") would never
      // equal its own trimmed echo and its admin would land in the
      // cross-org 403 — the #247 symptom again (#253 review). Resolve
      // to the RAW session.org so the engine path matches what the
      // no-param branch produces for the same caller.
      resolved = { crossOrg: false, org: session.org };
    } else if (session.isSuperAdmin !== true) {
      return {
        error: errorResponse(
          "Cross-org config access requires isSuperAdmin",
          403
        ),
      };
    } else {
      resolved = { crossOrg: true, org: trimmed };
    }
  }

  // The one shape encoding can't neutralize: bare "." / ".." survive
  // encodeURIComponent and URL parsers normalize the dot segment into
  // traversal (/orgs/../x → /x). Validated on the RESOLVED org — the
  // no-param session default included — because a param-only check
  // misses an org literally named "." reaching engine paths through
  // session.org (#253 review P2). admin.ts rejects these at user
  // create/move, but stored values predating that guard must still be
  // stopped here.
  if (isPathShapedOrg(resolved.org)) {
    return { error: errorResponse("Invalid org", 400) };
  }

  return resolved;
}

export async function handleConfig(
  request: Request,
  env: Env,
  session: SessionData,
  pathname: string
): Promise<Response> {
  const resolved = resolveOrg(request, session);
  if ("error" in resolved) {
    return resolved.error;
  }
  // Named so the raw-vs-encoded distinction travels with the variable:
  // the round-3 double-encoding bug happened because a pre-encoded local
  // called `org` was passed where raw resolved.org was expected. Helpers
  // that take an org (fetchResourceState, preflightMode,
  // gateConfigMutation, the rights migration) take RAW resolved.org;
  // path templates below take this.
  const encodedOrg = encodeURIComponent(resolved.org);

  // /api/config/prompt-overrides → GET (any session) / PUT/DELETE (admin)
  if (pathname === "/api/config/prompt-overrides") {
    if (isAdminMutation(request.method, session)) {
      return errorResponse("Forbidden", 403);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/prompt-overrides`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/modes/{name}/_rename → POST. Matched BEFORE the generic
  // mode route below — the `(.+)` there would otherwise capture
  // `{name}/_rename` as the mode name and reject POST as 405. The engine
  // (#232) reslugs the mode in place and keeps the old slug as an alias
  // so existing END-USER assignments aren't stranded.
  //
  // Authorization (#240): admins and cross-org super-admins pass as
  // before; non-admin shepherds pass with EDIT rights on the source
  // mode. `rightsFor` returns `[]` for modes when the verb field is
  // unset, so the pre-#181 admin-only baseline (both mode fields
  // undefined → deny) holds without a separate check. Publish-only
  // shepherds are denied — rename changes the mode's identity, which is
  // an edit-side action.
  //
  // Rights migration (#240): per-user `mode_edit_rights` /
  // `mode_publish_rights` are slug-scoped and nothing in the authz path
  // reads aliases, so renaming would strand every shepherd holding the
  // old slug. Around the engine call we run an expand→contract
  // migration over the target org's users (see worker/rights-migration
  // .ts for the atomicity model — at every intermediate point a user's
  // rights cover whichever slug is live).
  //
  // `[^/]+` (not `.+`) so `.../foo/_rename/_rename` doesn't slip past
  // with modeName = "foo/_rename" and waste an engine round-trip on a
  // guaranteed 404. Mode names are always single URL segments — the
  // portal URL-encodes any slashes upstream.
  const modeRenameMatch = pathname.match(
    /^\/api\/config\/modes\/([^/]+)\/_rename$/
  );
  if (modeRenameMatch?.[1]) {
    const modeName = decodeURIComponent(modeRenameMatch[1]);
    if (
      !resolved.crossOrg &&
      !hasAdminPowers(session) &&
      !hasRights(rightsFor(session, "mode", "edit"), modeName)
    ) {
      return errorResponse("Forbidden", 403);
    }
    // Method check before the body read so a non-POST still gets 405
    // (proxyToEngine would normally handle this, but we consume the
    // body first and a failed json() on a bodyless GET would misreport
    // as 400).
    if (request.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }
    // The migration needs `newName` before the engine call, so the arm
    // reads the body (one-shot stream) and passes the parsed copy back
    // through proxyToEngine. `| null` in the cast: the JSON literal
    // `null` parses without throwing, and dereferencing it would 500
    // instead of the 400 every other malformed body gets.
    let renameBody: { newName?: unknown } | null;
    try {
      renameBody = (await request.json()) as { newName?: unknown } | null;
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
    const newName =
      typeof renameBody?.newName === "string" ? renameBody.newName.trim() : "";
    if (!newName) {
      return errorResponse("Missing newName", 400);
    }

    // Preflights — both fail CLOSED (engine error or a payload missing
    // its canonical name → 502 retry, before any rights mutation), and
    // both engine GETs run in parallel (independent lookups; rd-4
    // latency note) with results evaluated source-first so the response
    // precedence is unchanged.
    //
    // Preflight 1 — the addressed slug must be the mode's CANONICAL
    // name. The engine resolves the rename source through aliases
    // (findModeBySlug honors aliases, engine #284), while this arm's
    // authz + migration key on the addressed slug. Without this check a
    // shepherd holding rights only on a stale ALIAS (e.g. left behind
    // by a retire-and-forward) could rename — and thereby capture — the
    // aliased-to mode, stranding its real shepherds. Runs AFTER authz,
    // so a no-rights caller can't probe mode existence through it.
    //
    // Preflight 2 — collision check BEFORE expanding rights. Without
    // it, renaming TO an existing mode's slug would grant every
    // old-slug holder rights on that live mode for the window between
    // expand and the engine's 409 (and permanently, if compensation's
    // best-effort write fails). The engine GET resolves aliases, so a
    // newName matching another mode's name OR alias surfaces here; a
    // newName that is THIS mode's own alias returns the same mode and
    // falls through — that's the engine's valid promote-own-alias
    // un-rename.
    // Raw resolved.org — fetchResourceState encodes internally; passing
    // the pre-encoded `org` local would double-encode (#253 review).
    const [source, target] = await Promise.all([
      preflightMode(env, resolved.org, modeName),
      preflightMode(env, resolved.org, newName),
    ]);
    // Source-first evaluation, FULLY: the source's definitive answers
    // (missing → 404, alias-addressed → 409) take precedence over a
    // target-side engine error — a flaky target GET must not mask
    // "the mode you're renaming doesn't exist" behind a generic
    // 502 retry prompt the user can never satisfy (rd-5 review).
    if (source.status === "error") {
      return errorResponse(
        "Engine unreachable; rename not attempted. Retry the rename.",
        502
      );
    }
    if (source.status === "missing") {
      return errorResponse("Mode not found", 404);
    }
    const canonicalName = source.mode.name;
    if (canonicalName !== modeName) {
      return errorResponse(
        `"${modeName}" is an alias of "${canonicalName}" — rename the mode via its canonical slug`,
        409
      );
    }
    if (target.status === "error") {
      return errorResponse(
        "Engine unreachable; rename not attempted. Retry the rename.",
        502
      );
    }
    if (target.status === "found" && target.mode.name !== canonicalName) {
      return errorResponse(
        `Slug "${newName}" already belongs to another mode (as a name or alias) in this org`,
        409
      );
    }

    // Phase 1 — expand: affected users hold BOTH slugs. Aborts (500)
    // without calling the engine if the user store can't be fully
    // updated, so a half-migrated store never coexists with a rename.
    //
    // `resolved.org` (raw), NOT the URL-encoded `org` used for engine
    // paths: stored `user.org` values are raw strings, so an org slug
    // that encodes differently (space, non-ASCII) would otherwise match
    // nobody and silently strand every shepherd (Frank rd-1 P1).
    let migrationRecords: MigrationRecord[];
    try {
      migrationRecords = await expandOrgModeRights(
        env,
        resolved.org,
        modeName,
        newName
      );
    } catch {
      return errorResponse("Rights migration failed; rename aborted", 500);
    }

    // Engine call under try/catch: a thrown fetch (network blip, DNS)
    // is an AMBIGUOUS outcome — the rename may or may not have applied.
    // Keep the superset (both slugs) rather than guessing: compensating
    // a rename that actually landed would strand every shepherd, while
    // a stale extra entry is inert. 502 tells the caller to retry.
    let engineRes: Response;
    try {
      engineRes = await proxyToEngine(
        request,
        env,
        `/api/v1/admin/orgs/${encodedOrg}/modes/${encodeURIComponent(modeName)}/_rename`,
        ["POST"],
        // Forward the TRIMMED newName — the same value the migration
        // used (Frank rd-1 P2).
        { ...renameBody, newName }
      );
    } catch (err) {
      console.error(
        `rename ${modeName}→${newName} (org=${resolved.org}): engine call threw after expand; leaving rights superset in place`,
        err
      );
      return errorResponse(
        "Engine unreachable; rename may not have applied. Retry the rename.",
        502
      );
    }

    // Phase 3 — classify the outcome:
    //   2xx        → rename applied → contract (drop the old slug).
    //   400–499    → engine definitively rejected (validation, races on
    //                collision/404) → compensate (drop the never-live
    //                new slug).
    //   everything → AMBIGUOUS. A 5xx can be emitted by a gateway after
    //   else         the engine committed — or WHILE the engine is
    //                still processing, so even a probe that reports the
    //                old name doesn't prove the rename won't land
    //                moments later (rd-3 review). The probe is used
    //                only in the ONE direction it's definitive: seeing
    //                the NEW canonical name proves the rename applied →
    //                contract. Every other 5xx-class outcome keeps the
    //                superset (both slugs) + logs — never compensate on
    //                uncertainty. Worst case is an inert extra entry;
    //                compensating a rename that lands strands every
    //                shepherd. (3xx lands here too rather than in the
    //                "rejected" band — it's not evidence of failure.)
    // Cleanup is best-effort in all branches (affected users already
    // hold the live slug; failures log inside the helper), and the
    // engine's response passes through regardless.
    if (engineRes.ok) {
      await contractOrgModeRights(env, migrationRecords, modeName, newName);
    } else if (engineRes.status >= 400 && engineRes.status < 500) {
      await contractOrgModeRights(env, migrationRecords, newName, modeName);
    } else {
      const probe = await preflightMode(env, resolved.org, modeName);
      if (probe.status === "found" && probe.mode.name === newName) {
        await contractOrgModeRights(env, migrationRecords, modeName, newName);
      } else {
        console.error(
          `rename ${modeName}→${newName} (org=${resolved.org}): engine returned ${engineRes.status} and the probe could not confirm the rename applied; leaving rights superset in place`
        );
      }
    }
    return engineRes;
  }

  // /api/config/modes/{name}/_clone → POST. Admin/cross-org ONLY —
  // deliberately STRICTER than _rename, which #240 opened to edit-
  // rights shepherds. The engine creates a new mode with the new slug +
  // optional label; content is copied verbatim from the source. Rights
  // don't migrate — mode_edit_rights / mode_publish_rights are slug-
  // scoped and no shepherd holds rights on the fresh slug yet, so a
  // non-admin cloning would land on a mode they can't edit. Opening
  // this needs a cloner-auto-grant decision (rights-migration.ts
  // primitives are ready; product call pending). Matched above the
  // catch-all for the same regex-ordering reason as _rename.
  // `[^/]+` for the same reason as _rename above.
  const modeCloneMatch = pathname.match(
    /^\/api\/config\/modes\/([^/]+)\/_clone$/
  );
  if (modeCloneMatch?.[1]) {
    const modeName = decodeURIComponent(modeCloneMatch[1]);
    if (!resolved.crossOrg && !hasAdminPowers(session)) {
      return errorResponse("Forbidden", 403);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/modes/${encodeURIComponent(modeName)}/_clone`,
      ["POST"]
    );
  }

  // /api/config/modes/{name}/_retire → POST. Retires the source mode
  // by moving its canonical slug (+ its own existing aliases) onto the
  // target mode's aliases array, then deleting the source. Users
  // assigned to the source slug (or any of its previous aliases)
  // silently resolve to the target — the "bring FIA Coach users over
  // silently" flow from Ian's #232 plan §3.
  //
  // Admin/cross-org ONLY — deliberately STRICTER than _rename, which
  // #240 opened to edit-rights shepherds. Retire deletes a mode +
  // widens the target's alias set, both org-wide config changes;
  // whether the retired mode's shepherds should inherit rights on the
  // forward target is an open product call (rights-migration.ts
  // primitives are ready). `[^/]+` for the same reason as _rename and
  // _clone above.
  const modeRetireMatch = pathname.match(
    /^\/api\/config\/modes\/([^/]+)\/_retire$/
  );
  if (modeRetireMatch?.[1]) {
    const modeName = decodeURIComponent(modeRetireMatch[1]);
    if (!resolved.crossOrg && !hasAdminPowers(session)) {
      return errorResponse("Forbidden", 403);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/modes/${encodeURIComponent(modeName)}/_retire`,
      ["POST"]
    );
  }

  // /api/config/modes/{name} → GET (any session) / PUT/DELETE (per-mode
  // verb-perms, admin-trump)
  const modeMatch = pathname.match(/^\/api\/config\/modes\/(.+)$/);
  if (modeMatch?.[1]) {
    const modeName = decodeURIComponent(modeMatch[1]);
    if (request.method === "PUT" || request.method === "DELETE") {
      const gate = await gateConfigMutation(
        request,
        env,
        session,
        resolved.org,
        "mode",
        modeName,
        resolved.crossOrg
      );
      if ("error" in gate) return gate.error;
      return proxyToEngine(
        request,
        env,
        `/api/v1/admin/orgs/${encodedOrg}/modes/${encodeURIComponent(modeName)}`,
        ["GET", "PUT", "DELETE"],
        gate.parsedBody
      );
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/modes/${encodeURIComponent(modeName)}`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/languages/{name} → GET / PUT / DELETE
  // (per-language verb-perms, admin-trump, super-admin cross-org bypass)
  const languageMatch = pathname.match(/^\/api\/config\/languages\/(.+)$/);
  if (languageMatch?.[1]) {
    const languageName = decodeURIComponent(languageMatch[1]);
    if (request.method === "PUT" || request.method === "DELETE") {
      const gate = await gateConfigMutation(
        request,
        env,
        session,
        resolved.org,
        "language",
        languageName,
        resolved.crossOrg
      );
      if ("error" in gate) return gate.error;
      // #247 bootstrap create — grant the creator both verbs on the new
      // slug BEFORE the engine call (#240 expand-first model: a failure
      // after the grant leaves an inert entry for a slug that doesn't
      // exist, never a lockout). Grant failure aborts the create — the
      // engine hasn't been touched, and creating a draft the creator
      // can't see would re-manifest the very bug this fixes.
      let grantedFields: LanguageVerbRightsField[] = [];
      if (gate.adminBootstrapCreate) {
        try {
          grantedFields = await grantLanguageSlugToUser(
            env,
            session.email,
            languageName
          );
        } catch (err) {
          console.error(
            `bootstrap create: rights grant failed for ${session.email} ("${languageName}")`,
            err
          );
          return errorResponse("Failed to grant creator rights", 502);
        }
      }
      const engineRes = await proxyToEngine(
        request,
        env,
        `/api/v1/admin/orgs/${encodedOrg}/languages/${encodeURIComponent(languageName)}`,
        ["GET", "PUT", "DELETE"],
        gate.parsedBody
      );
      // Compensate ONLY on a definitive engine rejection (4xx). A 5xx
      // or transport failure is ambiguous — the create may have landed —
      // so the grant superset is kept (same rule as the #240 rename
      // compensation: ambiguity never contracts rights).
      if (
        grantedFields.length > 0 &&
        engineRes.status >= 400 &&
        engineRes.status < 500
      ) {
        await revokeLanguageSlugFromUser(
          env,
          session.email,
          languageName,
          grantedFields
        );
      }
      return engineRes;
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/languages/${encodeURIComponent(languageName)}`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/user-mode/{userId} → PUT/DELETE (UUID v4 only)
  const userModeMatch = pathname.match(/^\/api\/config\/user-mode\/(.+)$/);
  if (userModeMatch?.[1]) {
    const userId = decodeURIComponent(userModeMatch[1]);
    if (!UUID_V4_RE.test(userId)) {
      return errorResponse("Invalid user ID", 400);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/users/${encodeURIComponent(userId)}/mode`,
      ["PUT", "DELETE"]
    );
  }

  // /api/config/user-memory/{userId} → GET/DELETE (UUID v4 only)
  const userMemoryMatch = pathname.match(/^\/api\/config\/user-memory\/(.+)$/);
  if (userMemoryMatch?.[1]) {
    const userId = decodeURIComponent(userMemoryMatch[1]);
    if (!UUID_V4_RE.test(userId)) {
      return errorResponse("Invalid user ID", 400);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/users/${encodeURIComponent(userId)}/memory`,
      ["GET", "DELETE"]
    );
  }

  // /api/config/modes → GET
  if (pathname === "/api/config/modes") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/modes`,
      ["GET"]
    );
  }

  // /api/config/languages → GET
  if (pathname === "/api/config/languages") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/languages`,
      ["GET"]
    );
  }

  // /api/config/language-scaffold → GET (org-scope; worker returns
  // a bundled default if no override is stored). PUT/DELETE are not
  // wired yet — there's no UI for editing the template, and exposing
  // mutation paths without admin gating would be unsafe.
  if (pathname === "/api/config/language-scaffold") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${encodedOrg}/language-scaffold`,
      ["GET"]
    );
  }

  return errorResponse("Not found", 404);
}

// Exported for unit tests in tests/config-verb-perms.test.ts. Internal use
// of these helpers stays inside this module; no other production caller
// should reach into them.
export const __testInternals = {
  computeRequiredVerbsForPut,
  hasRights,
  rightsFor,
};
