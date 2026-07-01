import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __testInternals, handleConfig } from "../worker/config";
import type { SessionData } from "../worker/types";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: crypto.randomUUID(),
    email: "alice@acme.com",
    name: "Alice",
    org: "acme",
    isAdmin: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(method: string, pathname: string): Request {
  return new Request(`https://portal.example.test${pathname}`, { method });
}

// When the gate fires, the worker must NOT touch the upstream engine — that
// would leak the request through despite the 403. We assert this by spying on
// fetch and verifying it was never called.
//
// `mockImplementation` returns a fresh Response per call: the #181 verb-perms
// gate does TWO fetches per PUT (one to read current state for the diff, one
// for the proxy). A single shared Response instance would have its body
// stream consumed by the first read, then explode on the second.
function spyFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );
}

describe("config authz — /api/config/modes/{name}", () => {
  it("non-admin PUT → 403 (and worker does not proxy upstream)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin DELETE → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin GET → proxies to engine (read is open)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken"
    );
  });

  it("admin PUT → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("admin DELETE → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});

describe("config authz — /api/config/prompt-overrides", () => {
  it("non-admin PUT → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin DELETE → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin GET → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("admin PUT → proxies to engine", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      new Request("https://portal.example.test/api/config/prompt-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "hi" }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("config authz — /api/config/modes (list)", () => {
  it("non-admin GET → proxies to engine (list is open)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes"
    );
  });
});

// ---------------------------------------------------------------------------
// Super-admin parity (#138)
// ---------------------------------------------------------------------------
//
// "super trumps isAdmin" is the principle in worker/admin.ts. It must apply
// uniformly across the worker — without these tests, a super-admin who
// self-demotes isAdmin (allowed) gets a weird partial-power state: they can
// manage users but can't edit modes/prompt-overrides. Pin the parity here
// so the next person touching isAdminMutation doesn't accidentally regress
// the isSuperAdmin branch.

describe("config authz — super admin trumps isAdmin", () => {
  it("super admin without isAdmin can PUT /api/config/modes/{name}", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("super admin without isAdmin can DELETE /api/config/modes/{name}", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("super admin without isAdmin can PUT /api/config/prompt-overrides", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      new Request("https://portal.example.test/api/config/prompt-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "hi" }),
      }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("admin with isSuperAdmin: true also still works (mixed-role regression)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/prompt-overrides"),
      env,
      makeSession({ isAdmin: true, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("neither isAdmin nor isSuperAdmin → 403 (regression on baseline)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/modes/spoken"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #181 verb-perms — edit vs publish, per language and per mode
// ---------------------------------------------------------------------------
//
// The BFF now splits the single language_rights / admin-only mode gates
// into per-verb gates: `*_edit_rights` controls draft saves, `*_publish_rights`
// controls publish-flag flips and (combined with edit rights) DELETEs. The
// gate diffs the PUT body against engine state to know what actually
// changed — so an autosave that only touched `document` requires edit
// rights, while a publish-toggle that only flipped `published` requires
// publish rights. See worker/config.ts:gateConfigMutation.

// Returns a fetch spy that simulates the engine's current-state response
// for the first call (which the gate makes to diff) and a generic 200 for
// any subsequent call (the proxy PUT/DELETE). `current === null` simulates
// a 404 — engine treats the resource as not-yet-created.
function spyFetchWithCurrent(
  kind: "language" | "mode",
  current: {
    document?: string;
    label?: string;
    description?: string;
    published?: boolean;
  } | null
) {
  let callCount = 0;
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      if (current === null) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      const wrapped =
        kind === "language" ? { language: current } : { mode: current };
      return Promise.resolve(
        new Response(JSON.stringify(wrapped), { status: 200 })
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

describe("config authz — #181 verb-perms (languages)", () => {
  it("edit-only PUT (document changed, published unchanged) → 200 with edit rights only", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: false }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((fetchSpy.mock.calls[1]![1] as RequestInit).method).toBe("PUT");
  });

  it("edit-only PUT → 403 without edit rights (publish rights alone aren't enough)", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: false }),
      }),
      env,
      makeSession({
        language_edit_rights: [],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    // The current-state GET fires (gate needs it to diff); the proxy PUT
    // does not.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("publish-only PUT (published flipped, document same) → 200 with publish rights only", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# same\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: [],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("publish-only PUT → 403 without publish rights", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# same\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("PUT that changes both document AND published needs both rights", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("PUT both with both rights → 200", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("legacy language_rights = ['spanish'] lazy-falls-back to BOTH verbs", async () => {
    // Pre-#181 sessions carry only `language_rights`. The gate must
    // accept the autosave (document edit) by falling back to the legacy
    // bit. Mirror of the worker/auth.ts lazy migration so existing
    // shepherds keep working until the admin re-saves them through the
    // new dialog.
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: true }),
      }),
      env,
      makeSession({ language_rights: ["spanish"] }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("creation (current state 404) needs edit rights when document is set", async () => {
    const fetchSpy = spyFetchWithCurrent("language", null);
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# brand new\n", published: false }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("creation with published: true needs BOTH edit and publish rights", async () => {
    const fetchSpy = spyFetchWithCurrent("language", null);
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# brand new\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("DELETE requires BOTH edit and publish rights — missing publish → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/languages/spanish"),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DELETE requires BOTH edit and publish rights — missing edit → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/languages/spanish"),
      env,
      makeSession({
        language_edit_rights: [],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DELETE with both rights → proxies", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/languages/spanish"),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});

describe("config authz — #181 verb-perms (modes)", () => {
  it("non-admin without any explicit mode rights → 403 (preserves pre-#181 admin-only baseline)", async () => {
    // Modes had no per-row rights pre-#181 — the gate was admin-only. The
    // "undefined === legacy full access" rule that languages inherit
    // from `language_rights` is NOT applied for modes; the dialog must
    // grant at least one of mode_edit_rights / mode_publish_rights for
    // a non-admin to escape this baseline.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n", published: false }),
      }),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("admin trumps per-mode rights (mirrors pre-#181 admin-can-edit-all-modes)", async () => {
    // Admin doesn't need the gate's current-state GET — admin-trump
    // bypasses the diff entirely, so the proxy is the only fetch.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## new\n", published: true }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("non-admin with mode_edit_rights=['spoken'] edit-only PUT → 200", async () => {
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## new\n", published: false }),
      }),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("non-admin with mode_edit_rights=['spoken'] but no publish — publish-flip → 403", async () => {
    // Footgun guard: pre-fix, mode_publish_rights=undefined fell through
    // to "legacy full access" and the publish-flip succeeded silently.
    // worker/config.ts:rightsFor now returns `[]` for any undefined
    // mode verb when the user is past the mode-baseline gate.
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## same\n", published: true }),
      }),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        // mode_publish_rights deliberately omitted — must NOT fall back
        // to legacy full access.
      }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("non-admin with mode_edit_rights=['spoken'] DELETE → 403 (publish missing)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
      }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with both mode rights on 'spoken' can DELETE 'spoken'", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("DELETE", "/api/config/modes/spoken"),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("non-admin with mode_publish_rights=['spoken'] can flip published without edit rights", async () => {
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## same\n", published: true }),
      }),
      env,
      makeSession({
        mode_edit_rights: [],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("[review F1] partner-aware deny: language_edit_rights=['en'], no publish rights → publish-flip 403s", async () => {
    // Without the partner-aware rightsFor rule, `language_publish_rights`
    // would fall through to `undefined ⇒ legacy full access` (the
    // pre-#181 back-compat semantic) and silently widen publish to
    // every language. Verifies the F1 fix: explicit grant of one verb
    // makes the unset partner verb a deliberate gap (= []), not legacy.
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# same\n", published: true }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        // language_publish_rights and language_rights deliberately
        // omitted — must NOT fall back to legacy full access.
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("[review F1] partner-aware deny: language_publish_rights=['en'], no edit rights → edit 403s", async () => {
    spyFetchWithCurrent("language", {
      document: "# old\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: false }),
      }),
      env,
      makeSession({ language_publish_rights: ["spanish"] }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(403);
  });

  it("[review F15] PUT against engine row missing `published` works for edit-only shepherd", async () => {
    // Engine rows predating the `published` field omit it on read.
    // Without F15's `current.published ?? false`, `false !== undefined`
    // evaluates true and the gate spuriously demands publish rights on
    // a normal edit save.
    const fetchSpy = spyFetchWithCurrent("language", { document: "# old\n" });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: false }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("[review F11] engine GET 5xx → gate treats as creation (no 502 leaked)", async () => {
    // A transient engine error during the gate's current-state GET
    // shouldn't add a second failure mode (502 from the BFF). The
    // gate treats unfetchable current as creation; creation
    // semantics are stricter than the diff path, so this fall-through
    // can only deny more, never allow more.
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("upstream oops", { status: 500 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/spanish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# new\n", published: false }),
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: [],
      }),
      "/api/config/languages/spanish"
    );
    // Treated as create: `published: false` doesn't require publish
    // rights, document does require edit (caller has it) → pass.
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("mode label change triggers edit gate (not just document)", async () => {
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      label: "Old Label",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          label: "New Label",
          published: false,
        }),
      }),
      env,
      makeSession({
        mode_edit_rights: [],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// #232 mode rename — POST /api/config/modes/{name}/_rename
// ---------------------------------------------------------------------------
//
// Rename reslugs a mode's canonical identity in place (the engine keeps the
// old slug as an alias so assigned users aren't stranded). The BFF restricts
// it to admins + super-admin cross-org and proxies the POST (with its
// `{ newName }` body) to the engine `_rename` op. Non-admin shepherds are
// blocked even with full per-row rights: their mode rights are slug-scoped
// and a rename would lock them out of the renamed slug (#238 review). The
// dedicated route must be matched before the generic `modes/{name}` route,
// which would otherwise swallow `{name}/_rename` and 405 the POST.

function makeRenameRequest(name: string, newName: string): Request {
  return new Request(
    `https://portal.example.test/api/config/modes/${name}/_rename`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName }),
    }
  );
}

describe("config authz — #232 mode rename (_rename)", () => {
  it("admin → proxies POST to engine _rename path", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken/_rename"
    );
  });

  it("super admin without isAdmin → proxies (super trumps isAdmin)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("non-admin without any explicit mode rights → 403 (baseline, no proxy)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with BOTH edit+publish on the row → 403 (rename is admin-only)", async () => {
    // The crux of the #238 review: full per-row rights are NOT enough.
    // Mode rights are slug-scoped, so letting a shepherd rename would lock
    // them out of the renamed slug. Only admins/cross-org may rename.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin cross-org via ?org=other → proxies to /orgs/other/.../_rename", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_rename?org=word-collective",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName: "conversation" }),
        }
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken/_rename"
    );
  });
});

// ---------------------------------------------------------------------------
// #241 PR B mode clone — POST /api/config/modes/{name}/_clone
// ---------------------------------------------------------------------------
//
// Clone creates a new mode (draft, distinct slug + optional label) via the
// engine `_clone` op. The BFF proxies POST + `{ newName, newLabel? }` to
// the engine, admin-gated on the same basis as _rename: per-user
// mode_edit_rights / mode_publish_rights are slug-scoped, and the clone's
// fresh slug has no rights pre-assigned, so a non-admin cloner would land
// on a mode they can't edit. Matched before the generic `modes/{name}` arm
// for the same regex-ordering reason as _rename.

function makeCloneRequest(name: string, body: object): Request {
  return new Request(
    `https://portal.example.test/api/config/modes/${name}/_clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("config authz — #241 PR B mode clone (_clone)", () => {
  it("admin → proxies POST to engine _clone path", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken/_clone"
    );
  });

  it("super admin without isAdmin → proxies (super trumps isAdmin)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("non-admin without any explicit mode rights → 403 (baseline, no proxy)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with BOTH edit+publish on the source row → 403 (clone is admin-only, same reasoning as rename)", async () => {
    // Clone's new slug carries no per-user rights, so a shepherd cloning
    // would produce a mode they can't edit. Gating this to admins/cross-
    // org avoids that trap; loosen when rights-migration exists (#240).
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin cross-org via ?org=other → proxies to /orgs/other/.../_clone", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_clone?org=word-collective",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName: "spoken-v2" }),
        }
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken/_clone"
    );
  });

  // #241 PR B Frank F8: the arm's regex was greedy (`(.+)`), so a path like
  // /api/config/modes/foo/_clone/_clone would capture `foo/_clone` as the
  // mode name and forward a guaranteed-404 request to the engine. Anchored
  // to `[^/]+` (mode names are always single URL segments), the crafted
  // path falls through to the generic modes/{name} arm — which is only
  // wired for GET/PUT/DELETE, so a POST gets 405 at the BFF without any
  // engine round-trip.
  it("does not match a duplicated /_clone suffix (regex is segment-anchored, not greedy)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/foo/_clone/_clone",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName: "bar" }),
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/foo/_clone/_clone"
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #241 PR C mode retire — POST /api/config/modes/{name}/_retire
// ---------------------------------------------------------------------------
//
// Retire moves the source mode's canonical slug (+ its own aliases) onto the
// target mode's aliases array, then deletes the source. Users assigned to
// the source (or resolving via one of its previous aliases) silently
// resolve to the target. Same admin/cross-org gate as _rename and _clone —
// deleting a mode is an org-wide config change at the same trust bar as
// today's PUT/DELETE modes. Regex is segment-anchored so a duplicated
// suffix falls through to the generic arm and 405s at the BFF.

function makeRetireRequest(name: string, body: object): Request {
  return new Request(
    `https://portal.example.test/api/config/modes/${name}/_retire`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("config authz — #241 PR C mode retire (_retire)", () => {
  it("admin → proxies POST to engine _retire path", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken/_retire"
    );
  });

  it("super admin without isAdmin → proxies (super trumps isAdmin)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("non-admin without any explicit mode rights → 403 (baseline, no proxy)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({ isAdmin: false }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with BOTH edit+publish on the source row → 403 (retire is admin-only)", async () => {
    // Same reasoning as rename/clone: retire deletes a mode + widens the
    // target's alias set (org-wide change), and the target's rights
    // aren't necessarily aligned with the source's — a shepherd who
    // could edit the source might have no rights on the target.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: ["spoken", "conversation"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin cross-org via ?org=other → proxies to /orgs/other/.../_retire", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_retire?org=word-collective",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forwardTo: "conversation" }),
        }
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken/_retire"
    );
  });

  it("does not match a duplicated /_retire suffix (regex is segment-anchored, not greedy)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/foo/_retire/_retire",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forwardTo: "bar" }),
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/foo/_retire/_retire"
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("config authz — #181 verb diff (pure function)", () => {
  const { computeRequiredVerbsForPut } = __testInternals;

  it("update changing only document → ['edit']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# new\n", published: false },
        { document: "# old\n", published: false }
      )
    ).toEqual(["edit"]);
  });

  it("update changing only published → ['publish']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# same\n", published: true },
        { document: "# same\n", published: false }
      )
    ).toEqual(["publish"]);
  });

  it("update changing both → ['edit', 'publish']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# new\n", published: true },
        { document: "# old\n", published: false }
      )
    ).toEqual(["edit", "publish"]);
  });

  it("update with no field changes → []", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# same\n", published: false },
        { document: "# same\n", published: false }
      )
    ).toEqual([]);
  });

  it("creation (current=null) with document → ['edit']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# brand new\n", published: false },
        null
      )
    ).toEqual(["edit"]);
  });

  it("creation with published: true → ['edit', 'publish']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# brand new\n", published: true },
        null
      )
    ).toEqual(["edit", "publish"]);
  });

  it("creation with published: false → ['edit'] (default-state isn't a publish)", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "# brand new\n", published: false },
        null
      )
    ).toEqual(["edit"]);
  });

  it("update changing only mode label → ['edit'] (label is editorial too)", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", label: "New", published: false },
        { document: "## same\n", label: "Old", published: false }
      )
    ).toEqual(["edit"]);
  });

  it("update changing only mode description → ['edit']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", description: "New", published: false },
        { document: "## same\n", description: "Old", published: false }
      )
    ).toEqual(["edit"]);
  });

  it("body missing a field doesn't trigger that field's verb", () => {
    // A future client that PUTs `{published: true}` only (no document)
    // should require publish-only.
    expect(
      computeRequiredVerbsForPut(
        { published: true },
        { document: "# whatever\n", published: false }
      )
    ).toEqual(["publish"]);
  });
});

// ---------------------------------------------------------------------------
// Cross-org override via ?org= (#166)
// ---------------------------------------------------------------------------
//
// Super admins need to edit modes/languages/prompt-overrides in orgs they
// don't sit in (Tim's 2026-05-21 Zoom — Elsy as super-admin couldn't see
// Word Collective from her uW session). Closing the gap with an explicit
// `?org=<slug>` query param: super-admin only, loud 403 for non-super,
// 400 on empty/path-traversal shapes. No behavior change when the param
// is absent — that's the everyday org-admin path.

function makeRequestWithQuery(
  method: string,
  pathname: string,
  query: string,
  init?: RequestInit
): Request {
  return new Request(`https://portal.example.test${pathname}?${query}`, {
    method,
    ...init,
  });
}

describe("config authz — cross-org via ?org= (#166)", () => {
  it("non-super-admin with ?org=other → 403 (loud reject, not silent fallback)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/modes/spoken", "org=other", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ isAdmin: true, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("plain user (non-admin) with ?org=other → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes/spoken", "org=other"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org=  (whitespace-only) → 400", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=%20%20"),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org= (empty) → 400", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org="),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("?org=foo/bar (path-traversal shape) → 400 even for super-admin", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=foo%2Fbar"),
      env,
      makeSession({ isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no ?org= + super-admin → uses session.org (regression: same-org path unchanged)", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequest("GET", "/api/config/modes"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes"
    );
  });

  it("super-admin PUT modes/{name} with ?org=other → proxies to /orgs/other/modes/...", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/modes/spoken",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "## Identity\n" }),
        }
      ),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken"
    );
  });

  it("super-admin GET modes list with ?org=other → proxies to /orgs/other/modes", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=word-collective"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes"
    );
  });

  it("super-admin PUT prompt-overrides with ?org=other → proxies to /orgs/other/prompt-overrides", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/prompt-overrides",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity: "hi" }),
        }
      ),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: true }),
      "/api/config/prompt-overrides"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/prompt-overrides"
    );
  });

  it("super-admin PUT languages/{name} with ?org=other bypasses language_rights", async () => {
    // language_rights are scoped to the user's home org; "english" in acme
    // and "english" in word-collective are distinct documents. Without the
    // cross-org bypass, a super-admin with restricted same-org shepherd
    // rights would inherit those restrictions when crossing orgs, which
    // makes no semantic sense and would block the workflow this PR exists
    // to enable.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "PUT",
        "/api/config/languages/english",
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "# English\n" }),
        }
      ),
      env,
      makeSession({
        org: "acme",
        isSuperAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/languages/english"
    );
  });

  it("super-admin with ?org=<own org> + restricted language_rights → 403 (no self-referential bypass)", async () => {
    // Frank's PR #185 review caught this: an earlier draft set
    // `crossOrg: true` for any present ?org=, so a restricted super
    // admin could bypass their own org's language_rights by adding a
    // self-referential ?org=acme. `crossOrg` must reflect the resolved
    // target vs. session.org, not merely the param's presence.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/languages/english", "org=acme", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# English\n" }),
      }),
      env,
      makeSession({
        org: "acme",
        isSuperAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin with ?org=<own org> + matching language_rights → 200 (treated as same-org)", async () => {
    // Parity check for the self-referential ?org= case: when rights
    // *do* permit the language, the same-org gate passes and the
    // request proxies normally (no spurious 403, no spurious /orgs/
    // path).
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/languages/spanish", "org=acme", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# Spanish\n" }),
      }),
      env,
      makeSession({
        org: "acme",
        isSuperAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    // Two fetches under #181 verb-perms: GET current state for the diff,
    // PUT proxy. Both target the same resource — the gate doesn't add
    // path churn, only verb-aware authz on top.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages/spanish"
    );
    expect((fetchSpy.mock.calls[1]![1] as RequestInit).method).toBe("PUT");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages/spanish"
    );
  });

  it("no ?org= + non-super with restricted language_rights → still 403 (same-org gate intact)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("PUT", "/api/config/languages/english"),
      env,
      makeSession({
        org: "acme",
        isAdmin: true,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin GET languages list with ?org=other → proxies to /orgs/other/languages", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/languages"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/languages"
    );
  });

  it("super-admin GET language-scaffold with ?org=other → proxies to /orgs/other/language-scaffold", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/language-scaffold",
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/language-scaffold"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/language-scaffold"
    );
  });

  it("super-admin PUT user-mode/{uuid} with ?org=other → proxies to /orgs/other/users/.../mode", async () => {
    const fetchSpy = spyFetch();
    const uuid = "00000000-0000-4000-8000-000000000001";
    await handleConfig(
      makeRequestWithQuery(
        "PUT",
        `/api/config/user-mode/${uuid}`,
        "org=word-collective",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "spoken" }),
        }
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      `/api/config/user-mode/${uuid}`
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/word-collective/users/${uuid}/mode`
    );
  });

  it("super-admin GET user-memory/{uuid} with ?org=other → proxies to /orgs/other/users/.../memory", async () => {
    const fetchSpy = spyFetch();
    const uuid = "00000000-0000-4000-8000-000000000002";
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        `/api/config/user-memory/${uuid}`,
        "org=word-collective"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      `/api/config/user-memory/${uuid}`
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/word-collective/users/${uuid}/memory`
    );
  });

  it("?org= trims whitespace and proxies the trimmed slug", async () => {
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/modes",
        "org=%20word-collective%20"
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/word-collective/modes"
    );
  });
});
