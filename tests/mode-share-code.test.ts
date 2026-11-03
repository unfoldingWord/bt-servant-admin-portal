import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleConfig } from "../worker/config";
import worker from "../worker/index";
import { handleModeShareCode } from "../worker/share-config";
import type { Env } from "../worker/helpers";
import type { SessionData } from "../worker/types";

// #345 — GET /api/config/modes/{name}/share-code. Pins: the org scoping
// (same as the mode GET: own org for anyone, cross-org for super-admins),
// that the RAW resolved org and WHATSAPP_ORG reach the worker, and how each
// worker answer (bt-servant-worker#477) is mapped for the panel.

afterEach(() => {
  vi.restoreAllMocks();
});

const GATEWAY = "unfoldingWord";
const testEnv = { ...env, WHATSAPP_ORG: GATEWAY } as Env;

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: crypto.randomUUID(),
    email: "alice@acme.com",
    name: "Alice",
    org: "PBT",
    isAdmin: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PATH = "/api/config/modes/obt-coach/share-code";

function call(
  opts: {
    session?: SessionData;
    query?: string;
    method?: string;
    env?: Env;
    path?: string;
  } = {}
): Promise<Response> {
  const path = opts.path ?? PATH;
  return handleConfig(
    new Request(`https://portal.example.test${path}${opts.query ?? ""}`, {
      method: opts.method ?? "GET",
    }),
    opts.env ?? testEnv,
    opts.session ?? makeSession(),
    path
  );
}

const CALLER = { caller: { isSuperAdmin: false } };

function workerReplies(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
      })
    )
  );
}

describe("share-code route — scoping", () => {
  it("asks the worker for the caller's own org, with WHATSAPP_ORG as home_org", async () => {
    const spy = workerReplies({ code: "pbt/obt-coach", resolves: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toBe(
      "https://engine.example.test/api/v1/admin/orgs/PBT/modes/obt-coach/share-code?home_org=unfoldingWord"
    );
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-engine-key"
    );
  });

  it("sends a legacy padded session org RAW, the key the mode read uses", async () => {
    const spy = workerReplies({ code: "team/x", resolves: true });
    await call({ session: makeSession({ org: " team" }), query: "?org=team" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/%20team/modes/"
    );
  });

  it("refuses another org for a non-super-admin, without calling the worker", async () => {
    const spy = workerReplies({});
    const res = await call({
      session: makeSession({ isAdmin: true }),
      query: "?org=Other",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Cross-org config access requires isSuperAdmin",
      code: "forbidden",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("answers 401 and the same-origin 403 with codes, like every config route", async () => {
    const url = `https://portal.example.test${PATH}`;
    const noOrigin = await worker.fetch(new Request(url), testEnv);
    expect(noOrigin.status).toBe(403);
    expect(await noOrigin.json()).toEqual({
      error: "Forbidden",
      code: "forbidden",
    });
    const noSession = await worker.fetch(
      new Request(url, { headers: { "X-Requested-With": "XMLHttpRequest" } }),
      testEnv
    );
    expect(noSession.status).toBe(401);
    expect(await noSession.json()).toEqual({
      error: "Unauthorized",
      code: "unauthorized",
    });
    // The BFF's own guard 403 carries the same code on every config route.
    const other = await worker.fetch(
      new Request("https://portal.example.test/api/config/modes"),
      testEnv
    );
    expect(await other.json()).toEqual({
      error: "Forbidden",
      code: "forbidden",
    });
  });

  it("never rewrites an engine 401 / 403 body the BFF passes through", async () => {
    // A real session, so the request reaches the proxy.
    const session = makeSession({
      isAdmin: true,
      email: `passthrough-${crypto.randomUUID()}@acme.com`,
    });
    await env.AUTH_KV.put(
      `user:${session.email}`,
      JSON.stringify({
        id: session.userId,
        email: session.email,
        name: session.name,
        org: session.org,
        passwordHash: "unused",
        salt: "unused",
        isAdmin: true,
        isSuperAdmin: false,
      })
    );
    const sessionId = crypto.randomUUID();
    await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session));
    for (const status of [401, 403]) {
      const engineBody = { error: "engine says no", detail: "x" };
      workerReplies(engineBody, status);
      const res = await worker.fetch(
        new Request("https://portal.example.test/api/config/modes", {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Cookie: `session=${sessionId}`,
          },
        }),
        testEnv
      );
      expect(res.status, String(status)).toBe(status);
      expect(await res.json()).toEqual(engineBody);
      vi.restoreAllMocks();
    }
  });

  it("lets a super-admin ask about another org's mode", async () => {
    const spy = workerReplies({ code: "other/obt-coach", resolves: true });
    const res = await call({
      session: makeSession({ isAdmin: true, isSuperAdmin: true }),
      query: "?org=Other",
    });
    expect(res.status).toBe(200);
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/Other/modes/obt-coach/share-code"
    );
  });

  it("is GET only", async () => {
    const spy = workerReplies({});
    const res = await call({ method: "POST" });
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({
      error: "Method not allowed",
      code: "method_not_allowed",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("is matched before the generic mode route", async () => {
    const spy = workerReplies({ code: "pbt/x", resolves: true });
    await call();
    // Not proxied as a mode named "obt-coach/share-code".
    expect(String(spy.mock.calls[0]![0])).not.toContain("%2Fshare-code");
  });
});

describe("share-code route — mapping the worker's answer", () => {
  it("passes a 200 answer through as capability present", async () => {
    workerReplies({
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "PBT",
      worker_version: "2.59.0",
    });
    const res = await call();
    expect(await res.json()).toEqual({
      capability: "present",
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "PBT",
      home_org: GATEWAY,
      queried_org: "PBT",
    });
  });

  it("names another org in resolved_org only to a super-admin", async () => {
    const collision = {
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "Secret Partner",
    };
    // An org admin of PBT: another org's name is stripped.
    workerReplies(collision);
    const admin = await call({ session: makeSession({ isAdmin: true }) });
    const adminBody = (await admin.json()) as Record<string, unknown>;
    expect(adminBody).not.toHaveProperty("resolved_org");
    expect(adminBody).toMatchObject({ reason: "collision" });
    vi.restoreAllMocks();
    // A super-admin sees it.
    workerReplies(collision);
    const superAdmin = await call({
      session: makeSession({ isAdmin: true, isSuperAdmin: true }),
    });
    expect(await superAdmin.json()).toMatchObject({
      resolved_org: "Secret Partner",
    });
  });

  it("keeps resolved_org when it is the caller's own org (an alias clash inside it)", async () => {
    workerReplies({
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "PBT",
    });
    const res = await call();
    expect(await res.json()).toMatchObject({ resolved_org: "PBT" });
  });

  it("compares the caller's org exactly: a padded foreign org is stripped", async () => {
    // " PBT" and "PBT" are different orgs to the worker (#247/#253).
    for (const [sessionOrg, resolvedOrg] of [
      ["PBT", " PBT"],
      [" PBT", "PBT"],
    ]) {
      workerReplies({
        code: "pbt/obt-coach",
        resolves: false,
        reason: "collision",
        resolved_org: resolvedOrg,
      });
      const res = await call({ session: makeSession({ org: sessionOrg }) });
      expect(
        await res.json(),
        `${sessionOrg}|${resolvedOrg}`
      ).not.toHaveProperty("resolved_org");
      vi.restoreAllMocks();
    }
    // A legacy padded org's own key, exactly: kept.
    workerReplies({
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: " PBT",
    });
    const own = await call({ session: makeSession({ org: " PBT" }) });
    expect(await own.json()).toMatchObject({ resolved_org: " PBT" });
  });

  it("passes an invalid_mode answer without home_has_modes through unchanged", async () => {
    workerReplies({ code: "pbt/x", resolves: false, reason: "invalid_mode" });
    const body = (await (await call()).json()) as Record<string, unknown>;
    expect(body).toEqual({
      capability: "present",
      home_org: GATEWAY,
      queried_org: "PBT",
      code: "pbt/x",
      resolves: false,
      reason: "invalid_mode",
    });
  });

  it("treats an empty code, or resolves without a code, as a malformed answer", async () => {
    workerReplies({ code: null, resolves: true });
    expect((await call()).status).toBe(502);
    vi.restoreAllMocks();
    workerReplies({ code: "", resolves: true });
    expect((await call()).status).toBe(502);
  });

  it("passes resolved_org_uncertain through, and only as true", async () => {
    workerReplies({
      code: "pbt/x",
      resolves: false,
      reason: "collision",
      resolved_org_uncertain: true,
    });
    expect(await (await call()).json()).toMatchObject({
      reason: "collision",
      resolved_org_uncertain: true,
    });
    vi.restoreAllMocks();
    workerReplies({
      code: "pbt/x",
      resolves: false,
      reason: "collision",
      resolved_org_uncertain: "yes",
    });
    expect(await (await call()).json()).not.toHaveProperty(
      "resolved_org_uncertain"
    );
  });

  it("passes home_has_modes through when the worker sends a boolean", async () => {
    workerReplies({ code: "pbt/x", resolves: true, home_has_modes: false });
    expect(await (await call()).json()).toMatchObject({
      capability: "present",
      home_has_modes: false,
      home_org: GATEWAY,
      queried_org: "PBT",
    });
    vi.restoreAllMocks();
    // A non-boolean is ignored rather than failing the answer.
    workerReplies({ code: "pbt/x", resolves: true, home_has_modes: "no" });
    const body = (await (await call()).json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("home_has_modes");
    expect(body.capability).toBe("present");
  });

  it("passes an unknown future reason through for the panel to treat generically", async () => {
    workerReplies({
      code: "pbt/x",
      resolves: false,
      reason: "some_future_reason",
    });
    expect(await (await call()).json()).toMatchObject({
      capability: "present",
      reason: "some_future_reason",
    });
  });

  it("passes a null code through (an org that slugs to nothing)", async () => {
    workerReplies({ code: null, resolves: false, reason: "org_skipped" });
    expect(await (await call()).json()).toMatchObject({
      capability: "present",
      code: null,
    });
  });

  it("rejects a malformed 200 rather than let it reach a QR", async () => {
    for (const body of [
      { code: 42, resolves: true },
      { code: "x", resolves: "yes" },
      { code: "x", resolves: false, reason: 7 },
      "not json",
    ]) {
      workerReplies(body);
      expect((await call()).status).toBe(502);
      vi.restoreAllMocks();
    }
  });

  it("maps a missing mode (404 mode_not_found) to 404", async () => {
    workerReplies({ error: "mode_not_found", message: "nope" }, 404);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("answers only a non-JSON or empty 404 as share_code_unsupported, home org included", async () => {
    // A worker without the route answers Hono's plain "404 Not Found".
    for (const body of ["404 Not Found", ""]) {
      for (const org of ["PBT", GATEWAY]) {
        workerReplies(body, 404);
        const res = await call({ session: makeSession({ org }) });
        expect(res.status, `${JSON.stringify(body)} ${org}`).toBe(404);
        expect(await res.json()).toEqual({
          error: "Share codes need a newer BT Servant",
          code: "share_code_unsupported",
        });
        vi.restoreAllMocks();
      }
    }
  });

  it("reads a JSON 404 with any other error as a route that exists: a generic error", async () => {
    workerReplies({ error: "something_else" }, 404);
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Engine error",
      code: "engine_error",
    });
  });

  it("uses a padded WHATSAPP_ORG exactly, for home_org", async () => {
    const padded = { ...env, WHATSAPP_ORG: " unfoldingWord" } as Env;
    const spy = workerReplies({ code: "x", resolves: true });
    const res = await call({ env: padded });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "home_org=%20unfoldingWord"
    );
    expect(await res.json()).toMatchObject({ home_org: " unfoldingWord" });
  });

  it("passes invalid_org with field org (or no field) through as code invalid_org", async () => {
    for (const body of [
      { error: "invalid_org", field: "org", message: "too long" },
      { error: "invalid_org", message: "too long" },
    ]) {
      workerReplies(body, 400);
      const res = await call();
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Invalid org",
        code: "invalid_org",
      });
      vi.restoreAllMocks();
    }
  });

  it("answers home_org_required (field home_org) as WHATSAPP_ORG unconfigured", async () => {
    workerReplies(
      { error: "home_org_required", field: "home_org", message: "required" },
      400
    );
    expect(await (await call()).json()).toEqual({
      capability: "unconfigured",
    });
  });

  it("answers invalid_org with field home_org as WHATSAPP_ORG unconfigured", async () => {
    // The worker is authoritative on home_org; the BFF's guard only skips
    // a round trip for values it already knows are unusable.
    workerReplies(
      { error: "invalid_org", field: "home_org", message: "too long" },
      400
    );
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ capability: "unconfigured" });
  });

  it("maps every 503 detail to 503, the panel's retry state", async () => {
    // Final #477 contract: 503 {error:'modes_unavailable', detail, message}.
    for (const detail of ["list_failed", "read_failed", "listing_lag"]) {
      workerReplies(
        { error: "modes_unavailable", detail, message: "try later" },
        503
      );
      expect((await call()).status, detail).toBe(503);
      vi.restoreAllMocks();
    }
    // ...and a 503 with no readable body.
    workerReplies("Service Unavailable", 503);
    expect((await call()).status).toBe(503);
  });

  it("passes the permanent 500 corrupt_modes_record through as itself", async () => {
    workerReplies(
      { error: "corrupt_modes_record", message: "not valid JSON" },
      500
    );
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Corrupt modes record",
      code: "corrupt_modes_record",
    });
  });

  it("gives every other 400 a code: invalid_mode_name, else bad_request", async () => {
    workerReplies({ error: "invalid_mode_name" }, 400);
    const name = await call();
    expect(name.status).toBe(400);
    expect(await name.json()).toEqual({
      error: "Invalid mode name",
      code: "invalid_mode_name",
    });
    vi.restoreAllMocks();
    workerReplies({ error: "something_new" }, 400);
    expect(await (await call()).json()).toEqual({
      error: "Bad request",
      code: "bad_request",
    });
  });

  it("gives the BFF's own org-resolution 400 the invalid_org code on this route only", async () => {
    const spy = workerReplies({});
    const res = await call({ query: "?org=%20" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid org",
      code: "invalid_org",
    });
    expect(spy).not.toHaveBeenCalled();
    // Another route keeps resolveOrg's own message, without a code.
    const other = await call({
      query: "?org=%20",
      path: "/api/config/modes/obt-coach",
    });
    expect(await other.json()).toEqual({ error: "Invalid org parameter" });
  });

  it("answers 504 when the worker doesn't answer in time", async () => {
    // The fetch never resolves on its own; it rejects when its signal aborts.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          const signal = (init as RequestInit).signal!;
          signal.addEventListener("abort", () => reject(signal.reason));
        })
    );
    const res = await handleModeShareCode(testEnv, "PBT", "obt-coach", {
      ...CALLER,
      timeoutMs: 20,
    });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      error: "Engine timeout",
      code: "engine_timeout",
    });
  });

  it("answers 504 when the body read is cut off by the timeout, even on a 404", async () => {
    // Headers arrived; the body then fails with the timeout's own error.
    // Without this it would read as "not JSON", and a 404 as an older worker.
    for (const [status, name] of [
      [404, "TimeoutError"],
      [200, "AbortError"],
    ] as const) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException("cut off", name));
            },
          }),
          { status }
        )
      );
      const res = await handleModeShareCode(
        testEnv,
        "PBT",
        "obt-coach",
        CALLER
      );
      expect(res.status, `${status} ${name}`).toBe(504);
      vi.restoreAllMocks();
    }
  });

  it("answers a body read that fails (not an abort) as a transient 502, never not-JSON", async () => {
    // On a 404 a "not JSON" body would read as a worker without the route.
    for (const status of [404, 200]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError("connection reset"));
            },
          }),
          { status }
        )
      );
      const res = await handleModeShareCode(
        testEnv,
        "PBT",
        "obt-coach",
        CALLER
      );
      expect(res.status, String(status)).toBe(502);
      expect(await res.json()).toEqual({
        error: "Engine error",
        code: "engine_error",
      });
      vi.restoreAllMocks();
    }
  });

  it("answers a client that went away with a bare 499", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          const signal = (init as RequestInit).signal!;
          signal.addEventListener("abort", () => reject(signal.reason));
        })
    );
    const client = new AbortController();
    const pending = handleModeShareCode(testEnv, "PBT", "obt-coach", {
      ...CALLER,
      signal: client.signal,
    });
    client.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    expect(await res.text()).toBe("");
  });

  it("cancels the upstream call when the browser's request aborts", async () => {
    const spy = workerReplies({ code: "x", resolves: true });
    const client = new AbortController();
    await handleModeShareCode(testEnv, "PBT", "obt-coach", {
      ...CALLER,
      signal: client.signal,
    });
    const upstream = (spy.mock.calls[0]![1] as RequestInit).signal!;
    expect(upstream.aborted).toBe(false);
    client.abort();
    expect(upstream.aborted).toBe(true);
  });

  it("passes the route's request signal to the handler", async () => {
    // Pending until its signal aborts, so the abort is what ends it.
    let upstream: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_, reject) => {
          upstream = (init as RequestInit).signal!;
          upstream.addEventListener("abort", () => reject(upstream!.reason));
        })
    );
    const client = new AbortController();
    const pending = handleConfig(
      new Request(`https://portal.example.test${PATH}`, {
        signal: client.signal,
      }),
      testEnv,
      makeSession(),
      PATH
    );
    await vi.waitFor(() => expect(upstream).toBeDefined());
    client.abort();
    const res = await pending;
    expect(upstream!.aborted).toBe(true);
    expect(res.status).toBe(499);
  });

  it("maps a worker 500 or a thrown fetch to 502", async () => {
    workerReplies({ error: "boom" }, 500);
    expect((await call()).status).toBe(502);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect((await call()).status).toBe(502);
  });

  it("leaves an over-long WHATSAPP_ORG to the worker, whose field home_org 400 is unconfigured", async () => {
    // Only an unset value is caught locally; the KV key rule is the worker's.
    const spy = workerReplies(
      { error: "invalid_org", field: "home_org", message: "too long" },
      400
    );
    const res = await call({
      env: { ...env, WHATSAPP_ORG: "a".repeat(507) } as Env,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ capability: "unconfigured" });
  });

  it("returns the exact org it queried, padded super-admin org included", async () => {
    const spy = workerReplies({
      code: "team/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: " team",
    });
    const res = await call({
      session: makeSession({ org: " team", isAdmin: true, isSuperAdmin: true }),
    });
    expect(String(spy.mock.calls[0]![0])).toContain("/orgs/%20team/modes/");
    expect(await res.json()).toMatchObject({
      queried_org: " team",
      resolved_org: " team",
    });
  });

  it("answers unconfigured without calling the worker when WHATSAPP_ORG is unset", async () => {
    const spy = workerReplies({});
    const res = await call({ env: { ...env, WHATSAPP_ORG: " " } as Env });
    expect(await res.json()).toEqual({ capability: "unconfigured" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("mode routes — a malformed %-escape in the name is a 400, not a 500", () => {
  const BAD = "%E0%A4%A";
  it("GET <bad>/share-code answers with the invalid_mode_name code", async () => {
    const spy = workerReplies({});
    const res = await call({ path: `/api/config/modes/${BAD}/share-code` });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid mode name",
      code: "invalid_mode_name",
    });
    expect(spy).not.toHaveBeenCalled();
  });
  for (const [method, path] of [
    ["GET", `/api/config/modes/${BAD}`],
    ["PUT", `/api/config/modes/${BAD}`],
    ["DELETE", `/api/config/modes/${BAD}`],
    ["POST", `/api/config/modes/${BAD}/_rename`],
    ["POST", `/api/config/modes/${BAD}/_clone`],
    ["POST", `/api/config/modes/${BAD}/_retire`],
  ] as const) {
    it(`${method} ${path.replace(BAD, "<bad>")}`, async () => {
      const spy = workerReplies({});
      const res = await call({
        method,
        path,
        session: makeSession({ isAdmin: true }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid mode name" });
      expect(spy).not.toHaveBeenCalled();
    });
  }
});

describe("other /api/config routes — a malformed %-escape is a 400, not a 500", () => {
  const BAD = "%E0%A4%A";
  for (const [method, path, error] of [
    ["GET", `/api/config/languages/${BAD}`, "Invalid language name"],
    ["GET", `/api/config/user-mode/${BAD}`, "Invalid user ID"],
    ["GET", `/api/config/user-memory/${BAD}`, "Invalid user ID"],
    ["DELETE", `/api/config/mcp-servers/${BAD}`, "Invalid server id encoding"],
  ] as const) {
    it(`${method} ${path.replace(BAD, "<bad>")}`, async () => {
      const spy = workerReplies({});
      const res = await call({
        method,
        path,
        session: makeSession({ isAdmin: true, isSuperAdmin: true }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
      expect(spy).not.toHaveBeenCalled();
    });
  }
});
