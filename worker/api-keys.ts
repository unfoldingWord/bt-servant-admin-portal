// ---------------------------------------------------------------------------
// Partner API keys (#354) — /api/config/api-keys*
// ---------------------------------------------------------------------------
//
// The worker's key endpoints (`/api/v1/admin/api-keys`) are super-admin only
// and know nothing about the portal user: the BFF calls them with the one
// engine admin key. So THIS module is the only place the org boundary can be
// enforced, and it is enforced here, never in the client:
//
//   - the org a key is listed for or created in is the RESOLVED org from
//     `resolveOrg` (worker/config.ts): the session's own org, or, for a super
//     admin only, `?org=`. The browser's body never carries an org — unknown
//     body fields are refused, and the engine body is built here from
//     whitelisted fields;
//   - revoke and rotate address a key by id, so the key is read first and a
//     non-super-admin is refused unless `key.org` is their session org. A
//     key's org never changes once issued (worker ledger.ts), so the read and
//     the write can't disagree about it;
//   - `createdBy` / `revokedBy` are the session email, never client input;
//   - listing every org's keys (`?scope=all`) is super-admin only, and a
//     single-org list is also filtered here to that org, so a worker-side
//     filter bug can't leak another org's keys.
//
// Terms acceptance lives in AUTH_KV (the portal's own store, beside users and
// sessions) at `api-terms:<version>:<org>`, written once per org and version.
// The create route is the gate: no acceptance for the current version → 409
// unless the request carries `acceptTerms: <current version>`, which records
// the acceptance (who, when, version) and creates the key in one request (no
// read-after-write against eventually consistent KV). Each key also carries
// the version and acceptance time on its worker record.

import {
  API_KEY_ERRORS,
  API_KEY_ID_PATTERN,
  API_TERMS_TEXT,
  API_TERMS_VERSION,
  KEYABLE_ORG_PATTERN,
} from "@/lib/api-keys-wire";
import { hasAdminPowers } from "@/lib/permissions";
import type { Env } from "./helpers";
import {
  authErrorResponse,
  discardBody,
  engineFetch,
  errorResponse,
  jsonResponse,
  safeDecode,
} from "./helpers";
import type { SessionData } from "./types";
import type { ApiTermsAcceptance } from "@/types/api-keys";

export const API_KEYS_PATH = "/api/config/api-keys";
const KEY_ACTION_PATH = /^\/api\/config\/api-keys\/([^/]+)\/(revoke|rotate)$/;
const ENGINE_BASE = "/api/v1/admin/api-keys";

/** True for every path this module owns. */
export function isApiKeysPath(pathname: string): boolean {
  return pathname === API_KEYS_PATH || pathname.startsWith(`${API_KEYS_PATH}/`);
}

/** The org resolved by worker/config.ts `resolveOrg`. */
export interface ApiKeysTarget {
  org: string;
  crossOrg: boolean;
}

// Responses that carry a plaintext key (or could): never cached anywhere.
const NO_STORE = { "Cache-Control": "no-store" } as const;

function codedError(
  message: string,
  code: string,
  status: number,
  extra: Record<string, unknown> = {}
): Response {
  return jsonResponse({ error: message, code, ...extra }, status);
}

/** Pass the engine's response through (status and body), never cached. */
function passThrough(res: Response): Response {
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json", ...NO_STORE },
  });
}

function orgNotKeyable(org: string): Response {
  return codedError(
    `The org id "${org}" can't hold API keys: it must be 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit. Ask unfoldingWord to rename the org.`,
    API_KEY_ERRORS.orgNotKeyable,
    400
  );
}

// ---------------------------------------------------------------------------
// Terms acceptance (AUTH_KV)
// ---------------------------------------------------------------------------

// Version first: the version has no ":", so the org (free text) can't make
// two keys collide.
function termsKey(version: string, org: string): string {
  return `api-terms:${version}:${org}`;
}

export async function readTermsAcceptance(
  env: Pick<Env, "AUTH_KV">,
  org: string
): Promise<ApiTermsAcceptance | null> {
  return env.AUTH_KV.get<ApiTermsAcceptance>(termsKey(API_TERMS_VERSION, org), {
    type: "json",
  });
}

/**
 * Record `email`'s acceptance of the current terms for `org`. The first
 * acceptance of a version is kept: a record that already exists is returned
 * unchanged rather than overwritten.
 */
async function recordTermsAcceptance(
  env: Pick<Env, "AUTH_KV">,
  org: string,
  email: string
): Promise<ApiTermsAcceptance> {
  const existing = await readTermsAcceptance(env, org);
  if (existing) return existing;
  const record: ApiTermsAcceptance = {
    org,
    version: API_TERMS_VERSION,
    acceptedBy: email,
    acceptedAt: new Date().toISOString(),
  };
  await env.AUTH_KV.put(
    termsKey(API_TERMS_VERSION, org),
    JSON.stringify(record)
  );
  return record;
}

// ---------------------------------------------------------------------------
// Body helpers
// ---------------------------------------------------------------------------

type BodyResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Read a JSON object body and refuse any field outside `allowed`, so a
 * caller can never believe it set something (an org, an actor) the BFF does
 * not take from the browser. An empty body is `{}` when `allowEmpty`.
 */
async function readObjectBody(
  request: Request,
  allowed: ReadonlySet<string>,
  allowEmpty: boolean
): Promise<BodyResult> {
  const text = await request.text();
  if (text.trim() === "") {
    return allowEmpty
      ? { ok: true, record: {} }
      : { ok: false, response: errorResponse("Request body is required", 400) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, response: errorResponse("Invalid JSON", 400) };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: errorResponse("Request body must be a JSON object", 400),
    };
  }
  const record = parsed as Record<string, unknown>;
  const unknown = Object.keys(record).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      response: errorResponse(`Unknown field(s): ${unknown.join(", ")}`, 400),
    };
  }
  return { ok: true, record };
}

const CREATE_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "app",
  "acceptTerms",
]);
const ROTATE_FIELDS: ReadonlySet<string> = new Set(["graceSeconds"]);
const NO_FIELDS: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function listKeys(
  request: Request,
  env: Env,
  session: SessionData,
  target: ApiKeysTarget
): Promise<Response> {
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== null && scope !== "all") {
    return errorResponse('scope must be "all" or absent', 400);
  }
  const all = scope === "all";
  if (all && session.isSuperAdmin !== true) {
    return codedError(
      "Listing every org's API keys requires a super admin",
      API_KEY_ERRORS.allOrgsForbidden,
      403
    );
  }
  if (!all && !KEYABLE_ORG_PATTERN.test(target.org)) {
    return orgNotKeyable(target.org);
  }

  const res = await engineFetch(
    env,
    all ? ENGINE_BASE : `${ENGINE_BASE}?org=${encodeURIComponent(target.org)}`
  );
  if (!res.ok) return passThrough(res);

  let body: { keys?: unknown };
  try {
    body = await res.json();
  } catch {
    return errorResponse("The worker returned an unreadable key list", 502);
  }
  if (!Array.isArray(body.keys)) {
    return errorResponse("The worker returned no key list", 502);
  }
  // Defense in depth: a single-org list keeps only that org's records even
  // if the worker's filter ever widened. Non-objects are dropped too.
  const keys = body.keys.filter(
    (k): k is { org: string } =>
      k !== null &&
      typeof k === "object" &&
      typeof (k as { org?: unknown }).org === "string" &&
      (all || (k as { org: string }).org === target.org)
  );

  return jsonResponse({
    org: all ? null : target.org,
    keys,
    terms: {
      org: target.org,
      currentVersion: API_TERMS_VERSION,
      text: API_TERMS_TEXT,
      acceptance: await readTermsAcceptance(env, target.org),
    },
  });
}

async function createKey(
  request: Request,
  env: Env,
  session: SessionData,
  target: ApiKeysTarget
): Promise<Response> {
  const parsed = await readObjectBody(request, CREATE_FIELDS, false);
  if (!parsed.ok) return parsed.response;
  const { name, app, acceptTerms } = parsed.record;
  if (typeof name !== "string" || typeof app !== "string") {
    return errorResponse("name and app are required strings", 400);
  }
  if (acceptTerms !== undefined && typeof acceptTerms !== "string") {
    return errorResponse("acceptTerms must be a terms version string", 400);
  }
  if (!KEYABLE_ORG_PATTERN.test(target.org)) {
    return orgNotKeyable(target.org);
  }

  let acceptance = await readTermsAcceptance(env, target.org);
  if (!acceptance) {
    if (acceptTerms !== API_TERMS_VERSION) {
      return codedError(
        "Accept the API terms of use before creating this org's first key.",
        API_KEY_ERRORS.termsNotAccepted,
        409,
        { termsVersion: API_TERMS_VERSION, terms: API_TERMS_TEXT }
      );
    }
    acceptance = await recordTermsAcceptance(env, target.org, session.email);
  }

  const engineBody = {
    org: target.org,
    name,
    app,
    createdBy: session.email,
    termsVersion: acceptance.version,
    termsAcceptedAt: acceptance.acceptedAt,
    // The worker refuses an org with no stored config unless told otherwise,
    // to catch a super admin's typo. A caller's OWN org comes from the
    // signed-in account, not typed input, so it can't be a typo — and a new
    // partner org has no config until someone edits it. A super admin's
    // cross-org create keeps the worker's check.
    ...(target.crossOrg ? {} : { allow_new_org: true }),
  };
  const res = await engineFetch(env, ENGINE_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(engineBody),
  });
  return passThrough(res);
}

type KeyLookup = { ok: true; org: string } | { ok: false; response: Response };

/**
 * Read the key and decide whether `session` may act on it: super admins on
 * any key, everyone else only on their own org's. Fails closed on anything
 * but a well-formed 200.
 */
async function authorizeKey(
  env: Env,
  session: SessionData,
  keyId: string
): Promise<KeyLookup> {
  const res = await engineFetch(
    env,
    `${ENGINE_BASE}/${encodeURIComponent(keyId)}`
  );
  if (res.status === 404) {
    await discardBody(res);
    return { ok: false, response: errorResponse("API key not found", 404) };
  }
  if (!res.ok) {
    await discardBody(res);
    return {
      ok: false,
      response: errorResponse(
        "Couldn't verify the key's org — try again.",
        502
      ),
    };
  }
  let org: unknown;
  try {
    const body = (await res.json()) as { key?: { org?: unknown } };
    org = body.key?.org;
  } catch {
    org = undefined;
  }
  if (typeof org !== "string") {
    return {
      ok: false,
      response: errorResponse(
        "Couldn't verify the key's org — try again.",
        502
      ),
    };
  }
  if (session.isSuperAdmin !== true && org !== session.org) {
    return {
      ok: false,
      response: codedError(
        "This API key belongs to another org.",
        API_KEY_ERRORS.keyOtherOrg,
        403
      ),
    };
  }
  return { ok: true, org };
}

async function keyAction(
  request: Request,
  env: Env,
  session: SessionData,
  rawId: string,
  action: "revoke" | "rotate"
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }
  const keyId = safeDecode(rawId);
  if (keyId === null || !API_KEY_ID_PATTERN.test(keyId)) {
    return errorResponse("Invalid API key id", 400);
  }
  const parsed = await readObjectBody(
    request,
    action === "rotate" ? ROTATE_FIELDS : NO_FIELDS,
    true
  );
  if (!parsed.ok) return parsed.response;

  let engineBody: Record<string, unknown>;
  if (action === "rotate") {
    const grace = parsed.record.graceSeconds;
    if (
      grace !== undefined &&
      (typeof grace !== "number" || !Number.isInteger(grace))
    ) {
      return errorResponse("graceSeconds must be an integer", 400);
    }
    engineBody = {
      createdBy: session.email,
      ...(grace !== undefined ? { graceSeconds: grace } : {}),
    };
  } else {
    engineBody = { revokedBy: session.email };
  }

  const authz = await authorizeKey(env, session, keyId);
  if (!authz.ok) return authz.response;

  const res = await engineFetch(
    env,
    `${ENGINE_BASE}/${encodeURIComponent(keyId)}/_${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(engineBody),
    }
  );
  return passThrough(res);
}

/**
 * Entry point from worker/config.ts `handleConfig`, after the session, the
 * same-origin check and `resolveOrg` have run. Admin powers are required on
 * every route (org admins for their own org; super admins anywhere).
 */
export async function handleApiKeys(
  request: Request,
  env: Env,
  session: SessionData,
  target: ApiKeysTarget,
  pathname: string
): Promise<Response> {
  if (!hasAdminPowers(session)) {
    return authErrorResponse("Managing API keys requires an admin", 403);
  }

  if (pathname === API_KEYS_PATH) {
    if (request.method === "GET") {
      return listKeys(request, env, session, target);
    }
    if (request.method === "POST") {
      return createKey(request, env, session, target);
    }
    return errorResponse("Method not allowed", 405);
  }

  const match = pathname.match(KEY_ACTION_PATH);
  if (match?.[1] && (match[2] === "revoke" || match[2] === "rotate")) {
    return keyAction(request, env, session, match[1], match[2]);
  }
  return errorResponse("Not found", 404);
}
