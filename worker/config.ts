import type { Env } from "./helpers";
import { errorResponse } from "./helpers";
import type { LanguageRights, SessionData } from "./types";

// Sole authorization gate for per-language access. Engine is a
// trusted-portal model (single shared ADMIN_API_TOKEN, no user identity
// on admin paths), so this check is the only thing standing between a
// portal user and an engine call. `undefined` is the back-compat default
// for users predating language_rights — treated as full access.
function hasLanguageRights(
  rights: LanguageRights | undefined,
  name: string
): boolean {
  if (rights === undefined || rights === "*") return true;
  return rights.includes(name);
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
  allowedMethods: string[]
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
    try {
      body = JSON.stringify(await request.json());
    } catch {
      return errorResponse("Invalid JSON", 400);
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

// Mutations on org-wide prompt configuration (modes + prompt-overrides) are
// admin-only. The trusted-portal model (single shared ADMIN_API_TOKEN
// upstream, no per-user identity on admin paths) means this worker is the
// only enforcement point — without this gate, any authenticated user in the
// org could rewrite or delete the org's modes via direct fetch. GET stays
// open because non-admins need to read modes for the test-chat / trigger
// lookup, and prompt-overrides GET carries no sensitive data beyond the
// org's prompt configuration.
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

  // /api/config/modes/{name} → GET (any session) / PUT/DELETE (admin)
  const modeMatch = pathname.match(/^\/api\/config\/modes\/(.+)$/);
  if (modeMatch?.[1]) {
    if (isAdminMutation(request.method, session)) {
      return errorResponse("Forbidden", 403);
    }
    const modeName = decodeURIComponent(modeMatch[1]);
    return proxyToEngine(
      request,
      env,
      `/api/v1/admin/orgs/${org}/modes/${encodeURIComponent(modeName)}`,
      ["GET", "PUT", "DELETE"]
    );
  }

  // /api/config/languages/{name} → GET/PUT/DELETE
  const languageMatch = pathname.match(/^\/api\/config\/languages\/(.+)$/);
  if (languageMatch?.[1]) {
    const languageName = decodeURIComponent(languageMatch[1]);
    if (
      !resolved.crossOrg &&
      !hasLanguageRights(session.language_rights, languageName)
    ) {
      return errorResponse("Forbidden", 403);
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
