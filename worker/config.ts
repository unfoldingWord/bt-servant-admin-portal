import type { Env } from "./helpers";
import { errorResponse } from "./helpers";
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
  document?: string;
  label?: string;
  description?: string;
  published?: boolean;
}

async function fetchCurrentResource(
  env: Env,
  kind: ResourceKind,
  org: string,
  name: string
): Promise<ResourceShape | null> {
  const enginePath =
    kind === "language"
      ? `/api/v1/admin/orgs/${org}/languages/${encodeURIComponent(name)}`
      : `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(name)}`;
  const res = await fetch(`${env.ENGINE_BASE_URL}${enginePath}`, {
    headers: { Authorization: `Bearer ${env.ENGINE_API_KEY}` },
  });
  if (!res.ok) {
    // 404 → resource doesn't exist yet (creation). Any other non-2xx
    // (auth, 5xx, network blip): treat as null too so the gate falls
    // through to creation semantics. The downstream proxy PUT will
    // fail naturally if engine is genuinely down — duplicating the
    // failure mode at the gate makes verb-restricted shepherds the
    // first to lose autosave during transient engine flakiness for no
    // security benefit. Creation semantics demand at minimum edit on
    // any editorial field and publish on `published: true`, so the
    // fall-through is conservative (stricter, not laxer) than the
    // diff path would have produced.
    return null;
  }
  const data = (await res.json()) as Record<string, unknown>;
  // Engine wraps in { org, language|mode: {...} } — mirror of the
  // unwrap logic in src/lib/languages-api.ts + src/lib/config-api.ts.
  const wrapped = kind === "language" ? data.language : data.mode;
  if (wrapped && typeof wrapped === "object") {
    return wrapped as ResourceShape;
  }
  return data as ResourceShape;
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
//      the 403 path rather than a downstream 400.
//   5. DELETE / POST → requires BOTH edit + publish on the row. Deletion
//      is strictly more destructive than either alone; POST is the
//      mode `_rename` op (#232), which reslugs a mode's canonical
//      identity — gated as destructively as deletion.
//   6. PUT → diff body vs current and require the union of verbs the
//      diff implies (`edit` if any editorial field changed, `publish`
//      if the published flag flipped).
async function gateConfigMutation(
  request: Request,
  env: Env,
  session: SessionData,
  org: string,
  kind: ResourceKind,
  name: string,
  crossOrg: boolean
): Promise<{ ok: true; parsedBody?: ResourceShape } | { error: Response }> {
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

  // Early-deny: if the caller has zero rights on this row across both
  // verbs, no PUT diff can let them through. Rejecting before reading
  // the body keeps the gate side-effect-free in the impossible case and
  // preserves the pre-#181 same-org "restricted shepherd → 403 on any
  // unauthorized row" behavior even for bodyless probes.
  if (
    !hasRights(rightsFor(session, kind, "edit"), name) &&
    !hasRights(rightsFor(session, kind, "publish"), name)
  ) {
    return { error: errorResponse("Forbidden", 403) };
  }

  // DELETE and POST (mode `_rename`, #232) both require the full
  // edit+publish pair. The gate never consumes the body on these paths,
  // so the downstream proxy reads the `_rename` `{ newName }` payload
  // intact.
  if (request.method === "DELETE" || request.method === "POST") {
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
    // `fetchCurrentResource` returns null for any engine non-2xx
    // (including 5xx / network errors) — the gate then treats the PUT
    // as a creation, which is conservative (every editorial field
    // present demands edit; published: true demands publish).
    const current = await fetchCurrentResource(env, kind, org, name);
    for (const verb of computeRequiredVerbsForPut(body, current)) {
      if (!hasRights(rightsFor(session, kind, verb), name)) {
        return { error: errorResponse("Forbidden", 403) };
      }
    }
    return { ok: true, parsedBody: body };
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

// Cross-org override via ?org=<slug>. Super-admin only; reject loud rather
// than silently falling back to session.org so a UI bug or hostile probe
// surfaces visibly instead of masquerading as a same-org request.
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
  if (orgParam === null) {
    return { crossOrg: false, org: session.org };
  }

  const trimmed = orgParam.trim();
  if (!trimmed || trimmed.includes("/")) {
    return { error: errorResponse("Invalid org parameter", 400) };
  }

  if (session.isSuperAdmin !== true) {
    return {
      error: errorResponse(
        "Cross-org config access requires isSuperAdmin",
        403
      ),
    };
  }

  return { crossOrg: trimmed !== session.org, org: trimmed };
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
  const org = encodeURIComponent(resolved.org);

  // /api/config/prompt-overrides → GET (any session) / PUT/DELETE (admin)
  if (pathname === "/api/config/prompt-overrides") {
    if (isAdminMutation(request.method, session)) {
      return errorResponse("Forbidden", 403);
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/prompt-overrides`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/modes/{name}/_rename → POST (per-mode verb-perms,
  // both edit+publish, admin-trump). Matched BEFORE the generic mode
  // route below — the `(.+)` there would otherwise capture
  // `{name}/_rename` as the mode name and reject POST as 405. The
  // engine (#232) reslugs the mode in place and keeps the old slug as
  // an alias so existing user assignments aren't stranded.
  const modeRenameMatch = pathname.match(
    /^\/api\/config\/modes\/(.+)\/_rename$/
  );
  if (modeRenameMatch?.[1]) {
    const modeName = decodeURIComponent(modeRenameMatch[1]);
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
      `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(modeName)}/_rename`,
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
        `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(modeName)}`,
        ["GET", "PUT", "DELETE"],
        gate.parsedBody
      );
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(modeName)}`,
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
      return proxyToEngine(
        request,
        env,
        `/api/v1/admin/orgs/${org}/languages/${encodeURIComponent(languageName)}`,
        ["GET", "PUT", "DELETE"],
        gate.parsedBody
      );
    }
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/languages/${encodeURIComponent(languageName)}`,
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
      `/api/v1/admin/orgs/${org}/users/${encodeURIComponent(userId)}/mode`,
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
      `/api/v1/admin/orgs/${org}/users/${encodeURIComponent(userId)}/memory`,
      ["GET", "DELETE"]
    );
  }

  // /api/config/modes → GET
  if (pathname === "/api/config/modes") {
    return proxyToEngine(request, env, `/api/v1/admin/orgs/${org}/modes`, [
      "GET",
    ]);
  }

  // /api/config/languages → GET
  if (pathname === "/api/config/languages") {
    return proxyToEngine(request, env, `/api/v1/admin/orgs/${org}/languages`, [
      "GET",
    ]);
  }

  // /api/config/language-scaffold → GET (org-scope; worker returns
  // a bundled default if no override is stored). PUT/DELETE are not
  // wired yet — there's no UI for editing the template, and exposing
  // mutation paths without admin gating would be unsafe.
  if (pathname === "/api/config/language-scaffold") {
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/language-scaffold`,
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
