import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleConfig } from "../worker/config";
import { readTermsAcceptance } from "../worker/api-keys";
import type { SessionData } from "../worker/types";
import { API_KEY_ERRORS, API_TERMS_VERSION } from "@/lib/api-keys-wire";
import { BFF_ERRORS } from "@/lib/bff-errors";

afterEach(() => {
  vi.restoreAllMocks();
});

// A fresh org per test so AUTH_KV terms records never leak between tests.
function freshOrg(): string {
  return `org-${crypto.randomUUID().slice(0, 8)}`;
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: crypto.randomUUID(),
    email: "alice@partner.test",
    name: "Alice",
    org: "acme",
    isAdmin: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(
  method: string,
  pathAndQuery: string,
  body?: unknown
): Request {
  return new Request(`https://portal.example.test${pathAndQuery}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function call(req: Request, session: SessionData): Promise<Response> {
  return handleConfig(req, env, session, new URL(req.url).pathname);
}

// Fresh Response per call; the last maker repeats.
function mockFetch(...makers: (() => Response)[]) {
  let i = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    const maker = makers[Math.min(i, makers.length - 1)]!;
    i += 1;
    return Promise.resolve(maker());
  });
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });
const keyRecord = (org: string, id = "pk_0123456789abcdef") => ({
  id,
  prefix: "bts_01234567",
  name: "Prod",
  app: "App",
  org,
  createdBy: "x@y.z",
  createdAt: "2026-11-13T00:00:00.000Z",
  status: "active",
});

const PATH = "/api/config/api-keys";
const KEY_ID = "pk_0123456789abcdef";

function engineUrl(spy: ReturnType<typeof mockFetch>, n: number): string {
  return String(spy.mock.calls[n]![0]);
}
function engineInit(spy: ReturnType<typeof mockFetch>, n: number): RequestInit {
  return spy.mock.calls[n]![1] as RequestInit;
}
function engineBody(spy: ReturnType<typeof mockFetch>, n: number): unknown {
  return JSON.parse(String(engineInit(spy, n).body));
}

describe("api keys (#354): who may use the routes", () => {
  it("a non-admin is refused on every route, before the engine", async () => {
    const spy = mockFetch(json({}));
    const user = makeSession();
    for (const req of [
      makeRequest("GET", PATH),
      makeRequest("POST", PATH, { name: "a", app: "b" }),
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke`),
      makeRequest("POST", `${PATH}/${KEY_ID}/rotate`),
    ]) {
      const res = await call(req, user);
      expect(res.status).toBe(403);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("an org admin naming another org with ?org= is refused (list and create)", async () => {
    const spy = mockFetch(json({ keys: [] }));
    const admin = makeSession({ isAdmin: true, org: freshOrg() });
    for (const req of [
      makeRequest("GET", `${PATH}?org=victim`),
      makeRequest("POST", `${PATH}?org=victim`, {
        name: "a",
        app: "b",
        acceptTerms: API_TERMS_VERSION,
      }),
    ]) {
      const res = await call(req, admin);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe(
        BFF_ERRORS.crossOrgForbidden
      );
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("an org admin can't list every org's keys", async () => {
    const spy = mockFetch(json({ keys: [] }));
    const res = await call(
      makeRequest("GET", `${PATH}?scope=all`),
      makeSession({ isAdmin: true })
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(
      API_KEY_ERRORS.allOrgsForbidden
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("api keys (#354): list", () => {
  it("an org admin lists only their own org, filtered again by the BFF", async () => {
    const org = freshOrg();
    const spy = mockFetch(
      json({ org, keys: [keyRecord(org), keyRecord("someone-else")] })
    );
    const res = await call(
      makeRequest("GET", PATH),
      makeSession({ isAdmin: true, org })
    );
    expect(res.status).toBe(200);
    expect(engineUrl(spy, 0)).toBe(
      `https://engine.example.test/api/v1/admin/api-keys?org=${org}`
    );
    const body = (await res.json()) as {
      org: string;
      keys: { org: string }[];
      terms: { currentVersion: string; acceptance: unknown };
    };
    expect(body.org).toBe(org);
    expect(body.keys.map((k) => k.org)).toEqual([org]);
    expect(body.terms.currentVersion).toBe(API_TERMS_VERSION);
    expect(body.terms.acceptance).toBeNull();
  });

  it("a super admin lists every org with ?scope=all", async () => {
    const spy = mockFetch(
      json({ org: null, keys: [keyRecord("a"), keyRecord("b")] })
    );
    const res = await call(
      makeRequest("GET", `${PATH}?scope=all`),
      makeSession({ isSuperAdmin: true })
    );
    expect(res.status).toBe(200);
    expect(engineUrl(spy, 0)).toBe(
      "https://engine.example.test/api/v1/admin/api-keys"
    );
    const body = (await res.json()) as { org: null; keys: unknown[] };
    expect(body.org).toBeNull();
    expect(body.keys).toHaveLength(2);
  });

  it("a super admin lists another org with ?org=", async () => {
    const spy = mockFetch(json({ keys: [keyRecord("other")] }));
    const res = await call(
      makeRequest("GET", `${PATH}?org=other`),
      makeSession({ isSuperAdmin: true })
    );
    expect(res.status).toBe(200);
    expect(engineUrl(spy, 0)).toContain("/api/v1/admin/api-keys?org=other");
  });

  it("an org id the worker can't key gets a coded 400 without an engine call", async () => {
    const spy = mockFetch(json({ keys: [] }));
    const res = await call(
      makeRequest("GET", PATH),
      makeSession({ isAdmin: true, org: "has space" })
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      API_KEY_ERRORS.orgNotKeyable
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("a malformed engine list is a 502, not an empty list", async () => {
    mockFetch(json({ nope: true }));
    const res = await call(
      makeRequest("GET", PATH),
      makeSession({ isAdmin: true, org: freshOrg() })
    );
    expect(res.status).toBe(502);
  });

  it("an unknown scope is a 400", async () => {
    const spy = mockFetch(json({ keys: [] }));
    const res = await call(
      makeRequest("GET", `${PATH}?scope=everything`),
      makeSession({ isSuperAdmin: true })
    );
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("api keys (#354): create and the terms gate", () => {
  it("the first key without accepting the terms → 409, nothing recorded or sent", async () => {
    const org = freshOrg();
    const spy = mockFetch(json({}, 201));
    const res = await call(
      makeRequest("POST", PATH, { name: "Prod", app: "App" }),
      makeSession({ isAdmin: true, org })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe(
      API_KEY_ERRORS.termsNotAccepted
    );
    expect(spy).not.toHaveBeenCalled();
    expect(await readTermsAcceptance(env, org)).toBeNull();
  });

  it("accepting an old terms version doesn't count", async () => {
    const spy = mockFetch(json({}, 201));
    const res = await call(
      makeRequest("POST", PATH, {
        name: "Prod",
        app: "App",
        acceptTerms: "1999-01-01",
      }),
      makeSession({ isAdmin: true, org: freshOrg() })
    );
    expect(res.status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
  });

  it("accept + create records who/when/version and builds the engine body server-side", async () => {
    const org = freshOrg();
    const spy = mockFetch(
      json({ key: keyRecord(org), apiKey: "bts_secret" }, 201)
    );
    const res = await call(
      makeRequest("POST", PATH, {
        name: "Prod",
        app: "App",
        acceptTerms: API_TERMS_VERSION,
      }),
      makeSession({ isAdmin: true, org, email: "owner@partner.test" })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const acceptance = await readTermsAcceptance(env, org);
    expect(acceptance).toMatchObject({
      org,
      version: API_TERMS_VERSION,
      acceptedBy: "owner@partner.test",
    });

    expect(engineUrl(spy, 0)).toBe(
      "https://engine.example.test/api/v1/admin/api-keys"
    );
    expect(engineInit(spy, 0).method).toBe("POST");
    expect(engineBody(spy, 0)).toEqual({
      org,
      name: "Prod",
      app: "App",
      createdBy: "owner@partner.test",
      termsVersion: API_TERMS_VERSION,
      termsAcceptedAt: acceptance!.acceptedAt,
      allow_new_org: true,
    });
  });

  it("once accepted, later keys need no acceptTerms and keep the first acceptance", async () => {
    const org = freshOrg();
    mockFetch(json({}, 201));
    const admin = makeSession({ isAdmin: true, org, email: "first@p.test" });
    await call(
      makeRequest("POST", PATH, {
        name: "A",
        app: "App",
        acceptTerms: API_TERMS_VERSION,
      }),
      admin
    );
    const first = await readTermsAcceptance(env, org);

    const res = await call(
      makeRequest("POST", PATH, { name: "B", app: "App" }),
      makeSession({ isAdmin: true, org, email: "second@p.test" })
    );
    expect(res.status).toBe(201);
    expect(await readTermsAcceptance(env, org)).toEqual(first);
  });

  it("an org (or any other extra field) in the body is refused, never forwarded", async () => {
    const spy = mockFetch(json({}, 201));
    for (const extra of [
      { org: "victim" },
      { createdBy: "someone@else" },
      { allow_new_org: true },
    ]) {
      const res = await call(
        makeRequest("POST", PATH, {
          name: "Prod",
          app: "App",
          acceptTerms: API_TERMS_VERSION,
          ...extra,
        }),
        makeSession({ isAdmin: true, org: freshOrg() })
      );
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("missing name/app and non-object bodies are 400s", async () => {
    const spy = mockFetch(json({}, 201));
    const admin = makeSession({ isAdmin: true, org: freshOrg() });
    for (const body of [{ name: "x" }, null, [1], "str"]) {
      const res = await call(makeRequest("POST", PATH, body), admin);
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("a super admin's cross-org create targets that org and keeps the worker's unknown-org check", async () => {
    const target = freshOrg();
    const spy = mockFetch(json({}, 201));
    const res = await call(
      makeRequest("POST", `${PATH}?org=${target}`, {
        name: "Prod",
        app: "App",
        acceptTerms: API_TERMS_VERSION,
      }),
      makeSession({ isSuperAdmin: true, email: "root@uw.test" })
    );
    expect(res.status).toBe(201);
    const sent = engineBody(spy, 0) as Record<string, unknown>;
    expect(sent.org).toBe(target);
    expect(sent.createdBy).toBe("root@uw.test");
    expect(sent).not.toHaveProperty("allow_new_org");
    expect(await readTermsAcceptance(env, target)).toMatchObject({
      acceptedBy: "root@uw.test",
    });
  });

  it("passes a worker refusal through with its status", async () => {
    mockFetch(json({ error: "name must not be empty" }, 400));
    const res = await call(
      makeRequest("POST", PATH, {
        name: " ",
        app: "App",
        acceptTerms: API_TERMS_VERSION,
      }),
      makeSession({ isAdmin: true, org: freshOrg() })
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "name must not be empty"
    );
  });
});

describe("api keys (#354): revoke and rotate are org-scoped", () => {
  const admin = () => makeSession({ isAdmin: true, org: "acme" });

  it("revoking your own org's key: reads it, then revokes with the session email", async () => {
    const spy = mockFetch(json({ key: keyRecord("acme") }), json({}));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke`),
      admin()
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(engineUrl(spy, 0)).toBe(
      `https://engine.example.test/api/v1/admin/api-keys/${KEY_ID}`
    );
    expect(engineUrl(spy, 1)).toBe(
      `https://engine.example.test/api/v1/admin/api-keys/${KEY_ID}/_revoke`
    );
    expect(engineBody(spy, 1)).toEqual({ revokedBy: "alice@partner.test" });
  });

  it("revoking another org's key → 403 and the revoke is never sent", async () => {
    const spy = mockFetch(json({ key: keyRecord("victim") }), json({}));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke`),
      admin()
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe(
      API_KEY_ERRORS.keyOtherOrg
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rotating another org's key → 403 and the rotate is never sent", async () => {
    const spy = mockFetch(json({ key: keyRecord("victim") }), json({}));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/rotate`, { graceSeconds: 0 }),
      admin()
    );
    expect(res.status).toBe(403);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("?org= naming the key's org doesn't help a non-super admin", async () => {
    const spy = mockFetch(json({ key: keyRecord("victim") }), json({}));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke?org=victim`),
      admin()
    );
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a super admin may revoke and rotate any org's key", async () => {
    const spy = mockFetch(
      json({ key: keyRecord("victim") }),
      json({ key: keyRecord("victim"), apiKey: "bts_new" })
    );
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/rotate`, { graceSeconds: 86400 }),
      makeSession({ isSuperAdmin: true, email: "root@uw.test" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(engineUrl(spy, 1)).toContain(`/api-keys/${KEY_ID}/_rotate`);
    expect(engineBody(spy, 1)).toEqual({
      createdBy: "root@uw.test",
      graceSeconds: 86400,
    });
  });

  it("an actor in the body is refused (the BFF sets it)", async () => {
    const spy = mockFetch(json({ key: keyRecord("acme") }), json({}));
    const revoke = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke`, {
        revokedBy: "someone@else",
      }),
      admin()
    );
    const rotate = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/rotate`, {
        createdBy: "someone@else",
      }),
      admin()
    );
    expect(revoke.status).toBe(400);
    expect(rotate.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a non-integer grace is a 400", async () => {
    const spy = mockFetch(json({}));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/rotate`, { graceSeconds: "7d" }),
      admin()
    );
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a malformed key id is a 400 before the engine", async () => {
    const spy = mockFetch(json({}));
    for (const id of [
      "pk_xyz",
      "pk_0123456789ABCDEF",
      "pk_0123456789abcdef0",
    ]) {
      const res = await call(
        makeRequest("POST", `${PATH}/${id}/revoke`),
        admin()
      );
      expect(res.status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("an unknown key is a 404", async () => {
    const spy = mockFetch(json({ error: "API key not found" }, 404));
    const res = await call(
      makeRequest("POST", `${PATH}/${KEY_ID}/revoke`),
      admin()
    );
    expect(res.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the key's org can't be read", async () => {
    for (const lookup of [
      json({ error: "boom" }, 500),
      json({ key: { id: KEY_ID } }),
      () => new Response("not json", { status: 200 }),
    ]) {
      const spy = mockFetch(lookup, json({}));
      const res = await call(
        makeRequest("POST", `${PATH}/${KEY_ID}/revoke`),
        admin()
      );
      expect(res.status).toBe(502);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    }
  });

  it("non-POST on an action is a 405; unknown sub-paths are 404s", async () => {
    const spy = mockFetch(json({}));
    const get = await call(
      makeRequest("GET", `${PATH}/${KEY_ID}/revoke`),
      admin()
    );
    expect(get.status).toBe(405);
    const other = await call(makeRequest("GET", `${PATH}/${KEY_ID}`), admin());
    expect(other.status).toBe(404);
    const put = await call(makeRequest("PUT", PATH, {}), admin());
    expect(put.status).toBe(405);
    expect(spy).not.toHaveBeenCalled();
  });
});
