import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleConfig } from "../worker/config";
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
    expect(spy).not.toHaveBeenCalled();
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

  it("answers 400, not a 500, on a malformed escape in the mode name", async () => {
    const spy = workerReplies({});
    const res = await call({ path: "/api/config/modes/%E0%A4%A/share-code" });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("is GET only", async () => {
    const spy = workerReplies({});
    const res = await call({ method: "POST" });
    expect(res.status).toBe(405);
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
      resolved_org: "pbt",
      worker_version: "2.59.0",
    });
    const res = await call();
    expect(await res.json()).toEqual({
      capability: "present",
      code: "pbt/obt-coach",
      resolves: false,
      reason: "collision",
      resolved_org: "pbt",
      home_org: GATEWAY,
    });
  });

  it("passes home_has_modes through when the worker sends a boolean", async () => {
    workerReplies({ code: "pbt/x", resolves: true, home_has_modes: false });
    expect(await (await call()).json()).toMatchObject({
      capability: "present",
      home_has_modes: false,
      home_org: GATEWAY,
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

  it("maps a route-level 404 (older worker) to capability absent, with the home verdict", async () => {
    workerReplies("404 Not Found", 404);
    expect(await (await call()).json()).toEqual({
      capability: "absent",
      home: false,
    });
    vi.restoreAllMocks();
    workerReplies("404 Not Found", 404);
    const home = await call({ session: makeSession({ org: GATEWAY }) });
    expect(await home.json()).toEqual({ capability: "absent", home: true });
  });

  it("decides home on the exact org, like the worker", async () => {
    workerReplies("404 Not Found", 404);
    const padded = await call({
      session: makeSession({ org: ` ${GATEWAY}` }),
    });
    expect(await padded.json()).toEqual({ capability: "absent", home: false });
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

  it("maps 400 unknown_home_org to its own config state", async () => {
    workerReplies(
      { error: "unknown_home_org", message: "no modes for home org" },
      400
    );
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      capability: "unknown-home-org",
      home_org: GATEWAY,
    });
  });

  it("passes any other 400 through", async () => {
    workerReplies({ error: "invalid_mode_name" }, 400);
    expect((await call()).status).toBe(400);
  });

  it("maps a worker 500 or a thrown fetch to 502", async () => {
    workerReplies({ error: "boom" }, 500);
    expect((await call()).status).toBe(502);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect((await call()).status).toBe(502);
  });

  it("answers unconfigured without calling the worker when WHATSAPP_ORG is unset", async () => {
    const spy = workerReplies({});
    const res = await call({ env: { ...env, WHATSAPP_ORG: " " } as Env });
    expect(await res.json()).toEqual({ capability: "unconfigured" });
    expect(spy).not.toHaveBeenCalled();
  });
});
