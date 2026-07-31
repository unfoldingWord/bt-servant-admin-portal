import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __testInternals, handleConfig } from "../worker/config";
import type { SessionData, StoredUser } from "../worker/types";

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
    requires_group?: boolean;
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
// old slug as an alias so assigned users aren't stranded). The BFF proxies
// the POST (with its `{ newName }` body) to the engine `_rename` op.
//
// #240 opened rename to non-admin shepherds with EDIT rights on the source
// mode: the arm now migrates per-user `mode_*_rights` (old slug → new slug)
// around the engine call, so a shepherd renaming their own mode keeps
// access to the renamed slug (previously the #238-review reason to gate
// admin-only). Publish-only shepherds stay denied — rename is an edit-side
// action. The dedicated route must be matched before the generic
// `modes/{name}` route, which would otherwise swallow `{name}/_rename` and
// 405 the POST. Migration side-effect coverage lives in the "#240 rename
// rights migration" describe below; pure-helper coverage in
// tests/rights-migration.test.ts.

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

// The #240 rename arm makes up to four engine calls: preflight GET of
// the source slug (canonical check), preflight GET of the target slug
// (collision check), the POST itself, and — on an ambiguous 5xx — a
// disambiguating re-GET of the source slug. This route-aware mock lets
// each test script those independently. GETs of the source slug return
// `source` on the first call and `probe` (default: same as source) on
// subsequent calls; GETs of the target slug return `target` (default:
// 404 — the normal "new slug is free" case).
function spyFetchRenameEngine(opts: {
  sourceSlug: string;
  targetSlug: string;
  source?: Record<string, unknown> | null;
  target?: Record<string, unknown> | null;
  probe?: Record<string, unknown> | null;
  engineStatus?: number;
  engineThrows?: boolean;
  // Simulate a transient engine failure (500) on the preflight GETs —
  // the fail-closed paths.
  sourceGetFails?: boolean;
  targetGetFails?: boolean;
}) {
  let sourceGets = 0;
  const wrap = (mode: Record<string, unknown> | null | undefined) =>
    mode
      ? new Response(JSON.stringify({ org: "x", mode }), { status: 200 })
      : new Response('{"error":"not found"}', { status: 404 });

  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        if (opts.engineThrows) {
          return Promise.reject(new Error("simulated network failure"));
        }
        return Promise.resolve(
          new Response('{"error":"engine says no"}', {
            status: opts.engineStatus ?? 200,
          })
        );
      }
      // GET — decide by which slug the path ends in. `undefined` means
      // "use the default"; an explicit `null` means 404 — hence the
      // === undefined checks rather than ??.
      const defaultSource =
        opts.source === undefined ? { name: opts.sourceSlug } : opts.source;
      if (url.endsWith(`/modes/${encodeURIComponent(opts.sourceSlug)}`)) {
        sourceGets += 1;
        if (sourceGets === 1 && opts.sourceGetFails) {
          return Promise.resolve(
            new Response('{"error":"transient"}', { status: 500 })
          );
        }
        if (sourceGets > 1) {
          return Promise.resolve(
            wrap(opts.probe === undefined ? defaultSource : opts.probe)
          );
        }
        return Promise.resolve(wrap(defaultSource));
      }
      if (url.endsWith(`/modes/${encodeURIComponent(opts.targetSlug)}`)) {
        if (opts.targetGetFails) {
          return Promise.resolve(
            new Response('{"error":"transient"}', { status: 500 })
          );
        }
        return Promise.resolve(
          wrap(opts.target === undefined ? null : opts.target)
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
}

// The engine POST within a route-aware mock's call list.
function findEnginePost(
  spy: ReturnType<typeof spyFetchRenameEngine>
): [string, RequestInit] | undefined {
  const call = spy.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "POST"
  );
  return call ? [String(call[0]), call[1] as RequestInit] : undefined;
}

describe("config authz — #209 requires_group is edit-gated", () => {
  it("publish-only shepherd flipping ONLY requires_group → 403 (no engine write)", async () => {
    // The load-bearing case. This caller clears the early-deny (they hold
    // publish on the row) and the body changes nothing the pre-fix gate
    // modelled, so the diff computed [] and the PUT sailed through to the
    // engine — group-visibility flipped without edit rights.
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
      requires_group: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          published: false,
          requires_group: true,
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
    // Only the gate's current-state read — the proxy never ran.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("publish-only shepherd flipping requires_group on a legacy row (field omitted) → 403", async () => {
    // Same denial when the stored row predates #209, so the coercion
    // can't be used as a bypass in the other direction.
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          published: false,
          requires_group: true,
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

  it("edit-rights shepherd flipping requires_group → 200 (proxied)", async () => {
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
      requires_group: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          published: false,
          requires_group: true,
        }),
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
    const init = fetchSpy.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      requires_group: true,
    });
  });

  it("publish-only shepherd publishing while re-asserting an UNCHANGED requires_group → 200", async () => {
    // The regression this fix must not cause: the portal sends the flag
    // pair on every PUT, so an explicit `requires_group: false` against a
    // legacy row (field omitted) must NOT demand edit — otherwise every
    // publish and every autosave by a single-verb shepherd starts 403ing.
    const fetchSpy = spyFetchWithCurrent("mode", {
      document: "## same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          published: true,
          requires_group: false,
        }),
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

  it("admin flipping requires_group → 200 (admin trump, no diff)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/modes/spoken", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: "## same\n",
          published: false,
          requires_group: true,
        }),
      }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("config authz — #232 mode rename (_rename)", () => {
  it("admin → proxies POST to engine _rename path", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    const post = findEnginePost(fetchSpy);
    expect(post).toBeDefined();
    expect(post![0]).toContain("/api/v1/admin/orgs/acme/modes/spoken/_rename");
  });

  it("super admin without isAdmin → proxies (super trumps isAdmin)", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: false, isSuperAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(findEnginePost(fetchSpy)).toBeDefined();
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

  it("non-admin shepherd with EDIT rights on the row → proxies (#240)", async () => {
    // Inversion of the #238-review case: with rights migration in place,
    // full per-row rights ARE enough. This was 403 pre-#240.
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    const post = findEnginePost(fetchSpy);
    expect(post).toBeDefined();
    expect(post![0]).toContain("/api/v1/admin/orgs/acme/modes/spoken/_rename");
  });

  it("non-admin shepherd with edit-only rights → proxies (#240 acceptance)", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ mode_edit_rights: ["spoken"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(findEnginePost(fetchSpy)).toBeDefined();
  });

  it("non-admin with publish-only rights → 403 (rename is edit-side)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ mode_publish_rights: ["spoken"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with edit rights on a DIFFERENT mode → 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ mode_edit_rights: ["other-mode"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("malformed JSON body → 400 without engine call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_rename",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{not json",
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("missing newName → 400 without engine call", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_rename",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("GET on the rename route → 405 (method gate precedes body read)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("GET", "/api/config/modes/spoken/_rename"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin cross-org via ?org=other → proxies to /orgs/other/.../_rename", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });
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
    const post = findEnginePost(fetchSpy);
    expect(post).toBeDefined();
    expect(post![0]).toContain(
      "/api/v1/admin/orgs/word-collective/modes/spoken/_rename"
    );
  });

  it("JSON `null` body → 400, not a thrown 500 (rd-2 F9)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_rename",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "null",
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("source slug that is an ALIAS of another mode → 409, no engine POST (rd-2 F1)", async () => {
    // The engine resolves the rename source through aliases, so a
    // shepherd holding rights only on a stale alias (e.g. left by a
    // retire-and-forward) could otherwise rename — and capture — the
    // aliased-to mode. The canonical-slug preflight closes it.
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "quiz",
      targetSlug: "quiz-two",
      source: { name: "chat" }, // GET quiz resolves to mode "chat"
    });
    const res = await handleConfig(
      makeRenameRequest("quiz", "quiz-two"),
      env,
      makeSession({ mode_edit_rights: ["quiz"] }),
      "/api/config/modes/quiz/_rename"
    );
    expect(res.status).toBe(409);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
  });

  it("source mode not found → 404, no engine POST", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "ghost",
      targetSlug: "anything",
      source: null,
    });
    const res = await handleConfig(
      makeRenameRequest("ghost", "anything"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/ghost/_rename"
    );
    expect(res.status).toBe(404);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
  });

  it("newName colliding with ANOTHER mode → 409 BEFORE any rights expand (rd-2 F2)", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      target: { name: "conversation" }, // an existing, different mode
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ mode_edit_rights: ["spoken"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(409);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
    // The escalation window never opened: no expand happened.
    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["spoken"]);
  });

  it("newName that is the mode's OWN alias → proceeds (promote-own-alias)", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "speak",
      // GET "speak" resolves (alias-aware) to the SAME mode.
      target: { name: "spoken" },
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "speak"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);
    expect(findEnginePost(fetchSpy)).toBeDefined();
  });

  it("engine error on SOURCE preflight → 502 fail-closed, not a false 404 (rd-3)", async () => {
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      sourceGetFails: true,
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
  });

  it("found mode WITHOUT a string name → 502 fail-closed, not a skipped guard (rd-4)", async () => {
    // The canonical-name comparisons ARE the security checks; a
    // response-shape drift that drops `name` must disable the rename,
    // not silently disable the guards.
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      source: { slug: "spoken" }, // no `name` field
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
  });

  it("source MISSING beats target-side engine error → 404, not 502 (rd-5)", async () => {
    // A flaky target GET must not mask "the mode you're renaming
    // doesn't exist" behind a retry prompt the user can never satisfy.
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "ghost",
      targetSlug: "anything",
      source: null,
      targetGetFails: true,
    });
    const res = await handleConfig(
      makeRenameRequest("ghost", "anything"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/ghost/_rename"
    );
    expect(res.status).toBe(404);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
  });

  it("thrown fetch during preflight → 502, not an uncaught exception (rd-5)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("connect failure"));
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("engine error on TARGET preflight → 502 fail-closed, no expand (rd-3 F1)", async () => {
    // The collision guard must not evaporate on a transient GET error —
    // that would reopen the escalation window it exists to close.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      targetGetFails: true,
    });
    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ mode_edit_rights: ["spoken"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);
    expect(findEnginePost(fetchSpy)).toBeUndefined();
    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["spoken"]);
  });
});

// ---------------------------------------------------------------------------
// PUT-gate parity — fetchResourceState extraction must not soften the gate
// ---------------------------------------------------------------------------

describe("PUT gate — thrown engine GET propagates (rd-5 parity)", () => {
  it("edit-only shepherd PUT while the gate's current-state GET throws → request fails, no proxy", async () => {
    // On main, a thrown fetch in fetchCurrentResource propagated and
    // the mutation was blocked. The rd-4 extraction briefly swallowed
    // it into null → creation semantics, which would have let an
    // edit-only shepherd unpublish a live mode (creation semantics
    // only demand publish on published:true). Pin the propagation.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connect failure")
    );
    await expect(
      handleConfig(
        new Request("https://portal.example.test/api/config/modes/spoken", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "# doc", published: false }),
        }),
        env,
        makeSession({ mode_edit_rights: ["spoken"] }),
        "/api/config/modes/spoken"
      )
    ).rejects.toThrow("connect failure");
  });
});

// ---------------------------------------------------------------------------
// #240 rename rights migration — per-user mode_*_rights old slug → new slug
// ---------------------------------------------------------------------------
//
// End-to-end through handleConfig with real AUTH_KV records: the rename arm
// expands affected users (old + new slug) before the engine call, then
// contracts (drops old) on engine success or compensates (drops the never-
// live new slug) on engine failure. Assertions inspect the stored user
// records directly — the first KV-side-effect coverage in this file.

interface SeedRightsUser {
  email: string;
  org: string;
  isAdmin?: boolean;
  mode_edit_rights?: StoredUser["mode_edit_rights"];
  mode_publish_rights?: StoredUser["mode_publish_rights"];
  language_rights?: StoredUser["language_rights"];
  language_edit_rights?: StoredUser["language_edit_rights"];
  language_publish_rights?: StoredUser["language_publish_rights"];
}

async function seedRightsUser(input: SeedRightsUser): Promise<void> {
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    email: input.email,
    name: input.email,
    org: input.org,
    // Auth fields are never consulted by the config gate — dummies keep
    // the seed cheap (no PBKDF2 per test).
    passwordHash: "x",
    salt: "x",
    isAdmin: input.isAdmin ?? false,
    mode_edit_rights: input.mode_edit_rights,
    mode_publish_rights: input.mode_publish_rights,
    language_rights: input.language_rights,
    language_edit_rights: input.language_edit_rights,
    language_publish_rights: input.language_publish_rights,
  };
  await env.AUTH_KV.put(`user:${input.email}`, JSON.stringify(stored));
}

async function readRightsUser(email: string): Promise<StoredUser> {
  const user = await env.AUTH_KV.get<StoredUser>(`user:${email}`, {
    type: "json",
  });
  if (!user) throw new Error(`seed user missing: ${email}`);
  return user;
}

describe("#240 rename rights migration", () => {
  it("engine success → affected users' arrays hold the new slug, old removed", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["other", "spoken"],
      mode_publish_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["other", "conversation"]);
    expect(after.mode_publish_rights).toEqual(["conversation"]);
  });

  it("renaming shepherd keeps access to the renamed mode (#240 acceptance)", async () => {
    // The shepherd's own stored record migrates like everyone else's;
    // validateSession re-reads the record per request, so their next
    // call sees the new slug without re-login.
    await seedRightsUser({
      email: "self@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ email: "self@acme.com", mode_edit_rights: ["spoken"] }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    const after = await readRightsUser("self@acme.com");
    expect(after.mode_edit_rights).toEqual(["conversation"]);
  });

  it("wildcard and unrelated users untouched; other-org same-slug untouched", async () => {
    await seedRightsUser({
      email: "wildcard@acme.com",
      org: "acme",
      mode_edit_rights: "*",
    });
    await seedRightsUser({
      email: "unrelated@acme.com",
      org: "acme",
      mode_edit_rights: ["other"],
    });
    await seedRightsUser({
      email: "elsewhere@word-collective.com",
      org: "word-collective",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    expect((await readRightsUser("wildcard@acme.com")).mode_edit_rights).toBe(
      "*"
    );
    expect(
      (await readRightsUser("unrelated@acme.com")).mode_edit_rights
    ).toEqual(["other"]);
    expect(
      (await readRightsUser("elsewhere@word-collective.com")).mode_edit_rights
    ).toEqual(["spoken"]);
  });

  it("engine 4xx → migration compensated, arrays unchanged, engine status passes through", async () => {
    // Preflights make the common collision a pre-expand 409, but the
    // engine can still definitively reject on races (mode created
    // between preflight and POST) or slug validation — those 4xx paths
    // must compensate.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["spoken", "zulu"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      engineStatus: 409,
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(409);

    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken"]);
    expect(after.mode_publish_rights).toEqual(["spoken", "zulu"]);
  });

  it("engine fetch THROWS after expand → 502 and the rights superset is retained (rd-2 F5)", async () => {
    // Ambiguous outcome: the rename may or may not have applied.
    // Compensating a rename that landed would strand shepherds, so the
    // arm keeps both slugs — access is covered either way.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      engineThrows: true,
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);

    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["spoken", "conversation"]);
  });

  it("engine 5xx + probe shows rename LANDED → contracts to the new slug (rd-2 F7)", async () => {
    // A gateway can emit a 5xx after the engine persisted the rename.
    // The disambiguating re-GET (alias-aware) reports the new canonical
    // name, so the arm contracts instead of wrongly compensating —
    // which would have stranded every shepherd.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      engineStatus: 502,
      probe: { name: "conversation" },
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(502);

    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["conversation"]);
  });

  it("engine 5xx + probe still shows the OLD name → keeps the superset (rd-3 F3)", async () => {
    // Probe-says-old is NOT definitive: a gateway 5xx can be emitted
    // while the engine is still processing, and the rename may commit
    // moments after the probe. Compensating here would strand every
    // shepherd on a dead slug. Only probe-says-NEW is proof (of
    // success); everything else keeps both slugs.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
      engineStatus: 500,
      probe: { name: "spoken" },
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(500);

    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["spoken", "conversation"]);
  });

  it("user already holding BOTH slugs is untouched by contract (pinned)", async () => {
    // Expand skips them (new slug already present), so they're outside
    // the recorded set that contract/compensate operate on. After the
    // rename their old-slug entry goes stale-but-inert (it survives as
    // an alias, and nothing in authz reads aliases). Deliberately NOT
    // cleaned up: we can't distinguish a stale entry from an intentional
    // grant made moments before the rename, and the conservative rule is
    // to never remove entries the migration didn't add.
    await seedRightsUser({
      email: "both@acme.com",
      org: "acme",
      mode_edit_rights: ["conversation", "spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    expect((await readRightsUser("both@acme.com")).mode_edit_rights).toEqual([
      "conversation",
      "spoken",
    ]);
  });

  it("org slug that URL-encodes differently still matches stored users (Frank rd-1 P1)", async () => {
    // Stored `user.org` values are raw strings; the engine path uses
    // encodeURIComponent(org). The migration must compare against the
    // RAW org — an org with a space would otherwise migrate nobody and
    // silently strand every shepherd.
    await seedRightsUser({
      email: "shepherd@spacey.com",
      org: "word collective",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      makeRenameRequest("spoken", "conversation"),
      env,
      makeSession({ org: "word collective", isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    expect(
      (await readRightsUser("shepherd@spacey.com")).mode_edit_rights
    ).toEqual(["conversation"]);
  });

  it("padded newName is trimmed for BOTH the migration and the engine body (Frank rd-1 P2)", async () => {
    // The BFF is the API boundary: a direct call with `" conversation "`
    // must not migrate rights to `conversation` while the engine
    // receives the padded original.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    const fetchSpy = spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

    const res = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_rename",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName: "  conversation  " }),
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_rename"
    );
    expect(res.status).toBe(200);

    const post = findEnginePost(fetchSpy);
    const sentBody = JSON.parse(post![1].body as string) as {
      newName: string;
    };
    expect(sentBody.newName).toBe("conversation");
    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["conversation"]);
  });

  it("cross-org rename migrates TARGET-org users, not the caller's home org", async () => {
    await seedRightsUser({
      email: "target@word-collective.com",
      org: "word-collective",
      mode_edit_rights: ["spoken"],
    });
    await seedRightsUser({
      email: "home@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
    });
    spyFetchRenameEngine({
      sourceSlug: "spoken",
      targetSlug: "conversation",
    });

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

    expect(
      (await readRightsUser("target@word-collective.com")).mode_edit_rights
    ).toEqual(["conversation"]);
    expect((await readRightsUser("home@acme.com")).mode_edit_rights).toEqual([
      "spoken",
    ]);
  });
});

// ---------------------------------------------------------------------------
// #241 PR B mode clone — POST /api/config/modes/{name}/_clone
// ---------------------------------------------------------------------------
//
// Clone creates a new mode (draft, distinct slug + optional label) via the
// engine `_clone` op. #257 opened it to shepherds at rename parity (EDIT
// on the source slug); non-admin same-org cloners are auto-granted both
// verbs on the new slug before the engine call (expand-first), with
// compensation only on a definitive engine 4xx and an X-Bootstrap-Grant
// response header so the client can mirror the grant. Matched before the
// generic `modes/{name}` arm for the same regex-ordering reason as
// _rename.

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

// Routed engine mock for the shepherd clone path: the collision
// preflight GET is answered per `preflight` ("missing" | "found" |
// "error"), the proxy POST per `post`.
function spyFetchCloneEngine(
  preflight: "missing" | "found" | "error",
  post: { status: number } | "throw" = { status: 200 }
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    if (method === "POST") {
      if (post === "throw") return Promise.reject(new Error("engine down"));
      return Promise.resolve(new Response("{}", { status: post.status }));
    }
    if (preflight === "found") {
      return Promise.resolve(
        new Response(JSON.stringify({ mode: { name: "spoken-v2" } }), {
          status: 200,
        })
      );
    }
    if (preflight === "error") {
      return Promise.resolve(new Response("", { status: 500 }));
    }
    return Promise.resolve(new Response("", { status: 404 }));
  });
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

  it("edit-only shepherd → 200, granted EDIT ONLY on the new slug (no publish widening, #258 rd-1), header set", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: [],
    });
    const fetchSpy = spyFetchCloneEngine("missing");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    // Verb-list header: edit only — publish was withheld on the source.
    expect(res.headers.get("X-Bootstrap-Grant")).toBe("edit");
    // Collision preflight GET + proxy POST.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((fetchSpy.mock.calls[1]![1] as RequestInit).method).toBe("POST");

    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken", "spoken-v2"]);
    // Publish was explicitly withheld on the source — the clone must
    // not widen it.
    expect(after.mode_publish_rights).toEqual([]);
  });

  it("edit+publish shepherd on the source → granted BOTH verbs on the new slug", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["spoken"],
    });
    spyFetchCloneEngine("missing");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Bootstrap-Grant")).toBe("edit,publish");
    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken", "spoken-v2"]);
    expect(after.mode_publish_rights).toEqual(["spoken", "spoken-v2"]);
  });

  it("newName collides with an existing mode/alias → 409 with NO grant written and no engine POST (#258 rd-1 P1)", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["spoken"],
    });
    const fetchSpy = spyFetchCloneEngine("found");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(409);
    // No rights on the colliding slug → bare 409, no header.
    expect(res.headers.get("X-Bootstrap-Grant")).toBeNull();
    // Preflight only — no grant, no engine POST, no escalation window.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken"]);
    expect(after.mode_publish_rights).toEqual(["spoken"]);
  });

  it("ambiguous-commit reconciliation: engine committed on a lost response, retry collides → 409 CARRIES the held verbs (#258 rd-2 P2)", async () => {
    // Attempt 1: grant written, engine created the mode, response lost
    // (worker returned 502, grant kept). The retry's live session
    // carries the kept grant; the collision preflight now finds the
    // mode. The 409 must name the caller's held verbs so the client
    // can mirror and surface the interrupted clone.
    const fetchSpy = spyFetchCloneEngine("found");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "spoken-v2"],
        mode_publish_rights: ["spoken", "spoken-v2"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("X-Bootstrap-Grant")).toBe("edit,publish");
    // Preflight only — no engine POST.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('ambiguous-commit reconciliation, edit-only variant → 409 carries "edit"', async () => {
    const fetchSpy = spyFetchCloneEngine("found");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "spoken-v2"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("X-Bootstrap-Grant")).toBe("edit");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("collision preflight engine error → 502 fail closed, no grant, no POST", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: [],
    });
    const fetchSpy = spyFetchCloneEngine("error");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      (await readRightsUser("shepherd@acme.com")).mode_edit_rights
    ).toEqual(["spoken"]);
  });

  it("retry after an ambiguous first attempt (grant already in KV) → header STILL set (#258 rd-1)", async () => {
    // First attempt granted and the engine 5xx'd; the slug is already
    // in both fields, so this request's grant writes nothing — the
    // client must still be told to mirror.
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken", "spoken-v2"],
      mode_publish_rights: ["spoken", "spoken-v2"],
    });
    spyFetchCloneEngine("missing");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken", "spoken-v2"],
        mode_publish_rights: ["spoken", "spoken-v2"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    // NOTE: preflight is mocked "missing" — the ambiguous first attempt
    // never created the mode. (The created-but-response-lost variant is
    // covered by the ambiguous-commit reconciliation tests above.)
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Bootstrap-Grant")).toBe("edit,publish");
  }, 10000);

  it("engine POST throws after the grant → 502 retry contract, grant kept (#258 rd-1)", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: [],
    });
    spyFetchCloneEngine("missing", "throw");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(502);
    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken", "spoken-v2"]);
  });

  it("publish-only shepherd on the source → 403, no grant, no proxy (cloning is edit-side)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        mode_edit_rights: [],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("TOCTOU race — preflight missing but engine 409s the create → grant compensated, no header", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: [],
    });
    spyFetchCloneEngine("missing", { status: 409 });
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("X-Bootstrap-Grant")).toBeNull();
    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken"]);
    expect(after.mode_publish_rights).toEqual([]);
  });

  it("engine 5xx on the clone → grant kept (ambiguity never contracts), no header", async () => {
    await seedRightsUser({
      email: "shepherd@acme.com",
      org: "acme",
      mode_edit_rights: ["spoken"],
      mode_publish_rights: [],
    });
    spyFetchCloneEngine("missing", { status: 500 });
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "shepherd@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("X-Bootstrap-Grant")).toBeNull();
    const after = await readRightsUser("shepherd@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken", "spoken-v2"]);
  });

  it("admin clone → NO grant and no header (mode admin trump covers)", async () => {
    await seedRightsUser({
      email: "admin@acme.com",
      org: "acme",
      isAdmin: true,
      mode_edit_rights: [],
      mode_publish_rights: [],
    });
    spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "admin@acme.com",
        isAdmin: true,
        mode_edit_rights: [],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Bootstrap-Grant")).toBeNull();
    const after = await readRightsUser("admin@acme.com");
    expect(after.mode_edit_rights).toEqual([]);
    expect(after.mode_publish_rights).toEqual([]);
  });

  it("stored user missing at grant time → 502, engine POST never fires", async () => {
    const fetchSpy = spyFetchCloneEngine("missing");
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "spoken-v2" }),
      env,
      makeSession({
        email: "ghost@acme.com",
        mode_edit_rights: ["spoken"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(502);
    // Only the collision preflight ran.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("padded newName → engine receives the TRIMMED value the grant used (#258 rd-1)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeCloneRequest("spoken", { newName: "  spoken-v2  " }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(
      String((fetchSpy.mock.calls[0]![1] as RequestInit).body)
    ) as { newName: string };
    expect(sent.newName).toBe("spoken-v2");
  });

  it("missing newName → 400; invalid JSON → 400; non-POST → 405 — all before any engine traffic", async () => {
    const fetchSpy = spyFetch();
    const noName = await handleConfig(
      makeCloneRequest("spoken", {}),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(noName.status).toBe(400);

    const badJson = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_clone",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{nope",
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(badJson.status).toBe(400);

    const wrongMethod = await handleConfig(
      new Request(
        "https://portal.example.test/api/config/modes/spoken/_clone",
        {
          method: "GET",
        }
      ),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_clone"
    );
    expect(wrongMethod.status).toBe(405);
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
// resolve to the target. #257 opened it to shepherds at DELETE-parity-
// plus: edit+publish on the source AND edit on the CANONICAL forward
// target, with two fail-closed preflights (canonical source addressing;
// target resolved to canonical before the rights check) so stale aliases
// can't capture or launder either side. Admin/cross-org callers keep the
// preflight-free fast path. Regex is segment-anchored so a duplicated
// suffix falls through to the generic arm and 405s at the BFF.

// URL-routing engine mock for the shepherd retire path: preflight GETs
// answered per-slug, the proxy POST answered 200. `slugStates` maps a
// slug to a found-name, "missing", or "error".
function spyFetchRetireEngine(
  slugStates: Record<string, string | "missing" | "error">
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    if (method === "POST") {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    const url = String(input);
    const slug = decodeURIComponent(url.split("/modes/")[1] ?? "");
    const state = slugStates[slug];
    if (state === undefined || state === "missing") {
      return Promise.resolve(new Response("", { status: 404 }));
    }
    if (state === "error") {
      return Promise.resolve(new Response("", { status: 500 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ mode: { name: state, document: "x" } }), {
        status: 200,
      })
    );
  });
}

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

  it("shepherd with edit+publish on source AND edit on target → 200 via preflights (#257)", async () => {
    const fetchSpy = spyFetchRetireEngine({
      spoken: "spoken",
      conversation: "conversation",
    });
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(200);
    // Two preflight GETs + the proxy POST.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(
      (fetchSpy.mock.calls[2]![1] as RequestInit | undefined)?.method
    ).toBe("POST");
  });

  it("shepherd edit-only on source (no publish) → 403 before any engine traffic (#257: DELETE parity)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: [],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shepherd lacking edit on the forward target → 403 after preflights, no proxy (#257)", async () => {
    const fetchSpy = spyFetchRetireEngine({
      spoken: "spoken",
      conversation: "conversation",
    });
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(403);
    // Preflights ran, proxy POST did not.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("alias-addressed source → 409, no proxy (stale-alias capture blocked, #257)", async () => {
    // Shepherd holds rights on the stale alias slug; the engine would
    // resolve it to the canonical mode and retire THAT. The canonical
    // preflight refuses.
    const fetchSpy = spyFetchRetireEngine({
      "old-alias": "spoken",
      conversation: "conversation",
    });
    const res = await handleConfig(
      makeRetireRequest("old-alias", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["old-alias", "conversation"],
        mode_publish_rights: ["old-alias"],
      }),
      "/api/config/modes/old-alias/_retire"
    );
    expect(res.status).toBe(409);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("forwardTo alias resolving to an unauthorized canonical target → 403 (alias laundering blocked, #257)", async () => {
    // Shepherd holds edit on the alias STRING but not on the canonical
    // mode it resolves to; the rights check keys on the canonical name.
    const fetchSpy = spyFetchRetireEngine({
      spoken: "spoken",
      "target-alias": "conversation",
    });
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "target-alias" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "target-alias"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shepherd preflight failure modes: source missing → 404, target missing → 404, engine error → 502 (fail closed)", async () => {
    const sourceMissing = spyFetchRetireEngine({
      conversation: "conversation",
    });
    let res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(404);
    sourceMissing.mockRestore();

    const targetMissing = spyFetchRetireEngine({ spoken: "spoken" });
    res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(404);
    targetMissing.mockRestore();

    spyFetchRetireEngine({ spoken: "error", conversation: "conversation" });
    res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "conversation" }),
      env,
      makeSession({
        mode_edit_rights: ["spoken", "conversation"],
        mode_publish_rights: ["spoken"],
      }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(502);
  });

  it("admin retire skips the preflights (single proxy fetch, unchanged fast path) and forwards trimmed forwardTo", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRetireRequest("spoken", { forwardTo: "  conversation  " }),
      env,
      makeSession({ isAdmin: true }),
      "/api/config/modes/spoken/_retire"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      String((fetchSpy.mock.calls[0]![1] as RequestInit).body)
    ) as { forwardTo: string };
    expect(sent.forwardTo).toBe("conversation");
  });

  it("missing forwardTo → 400; invalid JSON → 400; non-POST → 405", async () => {
    const fetchSpy = spyFetch();
    expect(
      (
        await handleConfig(
          makeRetireRequest("spoken", {}),
          env,
          makeSession({ isAdmin: true }),
          "/api/config/modes/spoken/_retire"
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleConfig(
          new Request(
            "https://portal.example.test/api/config/modes/spoken/_retire",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{nope",
            }
          ),
          env,
          makeSession({ isAdmin: true }),
          "/api/config/modes/spoken/_retire"
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleConfig(
          new Request(
            "https://portal.example.test/api/config/modes/spoken/_retire",
            { method: "GET" }
          ),
          env,
          makeSession({ isAdmin: true }),
          "/api/config/modes/spoken/_retire"
        )
      ).status
    ).toBe(405);
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

  it("#209 update changing only requires_group → ['edit']", () => {
    // The flag is mode configuration, gated on the same verb as the
    // document. Pre-fix this returned [] and any caller past the
    // early-deny could flip group-visibility for free.
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", published: false, requires_group: true },
        { document: "## same\n", published: false, requires_group: false }
      )
    ).toEqual(["edit"]);
  });

  it("#209 unchanged requires_group against a row that OMITS the field → []", () => {
    // The coercion case. Mode rows predating #209 have no
    // `requires_group` key, and the portal re-asserts the flag pair on
    // every PUT — without `current?.requires_group ?? false`, every
    // ordinary autosave against a legacy row would demand edit.
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", published: false, requires_group: false },
        { document: "## same\n", published: false }
      )
    ).toEqual([]);
  });

  it("#209 setting requires_group on a row that omits the field → ['edit']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", published: false, requires_group: true },
        { document: "## same\n", published: false }
      )
    ).toEqual(["edit"]);
  });

  it("#209 requires_group flip + publish flip → ['edit', 'publish']", () => {
    expect(
      computeRequiredVerbsForPut(
        { document: "## same\n", published: true, requires_group: true },
        { document: "## same\n", published: false, requires_group: false }
      )
    ).toEqual(["edit", "publish"]);
  });

  it("#209 creation with requires_group: true and no document → ['edit']", () => {
    // The only shape where the create arm changes observable behavior:
    // an ordinary create carries a `document`, which already demands
    // edit on its own (see the case below).
    expect(computeRequiredVerbsForPut({ requires_group: true }, null)).toEqual([
      "edit",
    ]);
  });

  it("#209 creation with requires_group: false and no document → [] (default state isn't a change)", () => {
    expect(computeRequiredVerbsForPut({ requires_group: false }, null)).toEqual(
      []
    );
  });

  it("#209 creation with document + requires_group: false → ['edit'] (unchanged from pre-#209)", () => {
    expect(
      computeRequiredVerbsForPut(
        {
          document: "# brand new\n",
          published: false,
          requires_group: false,
        },
        null
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
// `?org=<slug>` query param: cross-org is super-admin only (loud 403
// for non-super), 400 on empty/dot-segment shapes. No behavior change
// when the param is absent — that's the everyday org-admin path.

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

  it("?org=foo/bar (slash-named org) → proxies with the slash encoded (#253 review P2)", async () => {
    // Slash-named orgs are creatable (admin.ts only trims), so they must
    // be addressable; path safety comes from handleConfig's
    // encodeURIComponent, not from rejecting the shape.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=foo%2Fbar"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/modes"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/foo%2Fbar/modes"
    );
  });

  it.each([".", ".."])(
    "?org=%j → 400 even for super-admin (dot segments survive encoding)",
    async (dots) => {
      // encodeURIComponent leaves dots alone and the URL parser
      // normalizes /orgs/../x into a traversal — bare dot orgs stay
      // rejected.
      const fetchSpy = spyFetch();
      const res = await handleConfig(
        makeRequestWithQuery("GET", "/api/config/modes", `org=${dots}`),
        env,
        makeSession({ org: "acme", isSuperAdmin: true }),
        "/api/config/modes"
      );
      expect(res.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

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

  it("super-admin with ?org=<own org> + restricted language_rights → 200 via the #249 admin trump", async () => {
    // Pre-#249 this was a 403: PR #185 enforced per-row language rights
    // even for admins, so a restricted super admin was denied on a row
    // they didn't shepherd. #249 makes admin powers trump per-row
    // language rights (mode parity), so the same request now proxies.
    // The self-referential-?org= discriminator this test used to pin
    // (crossOrg must reflect resolved-target-vs-session.org, not the
    // param's presence — Frank, PR #185) is still pinned for the
    // population it can bite: the non-super shepherd test below
    // ("non-super with ?org=<own org> + restricted language_rights").
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
    expect(res.status).toBe(200);
    // Exactly one fetch, and it is the proxy PUT: the trump returns
    // before the gate parses the body or probes existence, so admin
    // language PUTs cost one engine call, like admin mode PUTs.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages/english"
    );
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
    // One fetch since #249: the caller has admin powers, so the trump
    // returns before the diff GET and only the proxy PUT reaches the
    // engine. No path churn — the gate never rewrites the target.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages/spanish"
    );
  });

  it("no ?org= + non-super with restricted language_rights → still 403 (same-org gate intact)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      new Request("https://portal.example.test/api/config/languages/english", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# English\n" }),
      }),
      env,
      makeSession({
        org: "acme",
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(403);
    // Non-admin shepherd with zero rights on this row: the early-deny
    // fires before the body is read, so the engine is never touched.
    // (#249 note: this session was `isAdmin: true` until the admin
    // trump landed, which contradicted the test's own "non-super
    // shepherd" intent — the admin case is covered by the "language
    // admin trump (#249)" describe below.)
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

// ---------------------------------------------------------------------------
// Path-shaped orgs (#253 review)
// ---------------------------------------------------------------------------
//
// Slash-named orgs must ride every engine-path builder ENCODED — the
// verb-perms gate's current-state lookup included (a raw interpolation
// reads /orgs/team/alpha/..., the engine 404s, and the gate collapses a
// legitimate publish flip into creation semantics → 403). Dot-segment
// orgs can't be neutralized by encoding at all and are rejected on the
// RESOLVED org, session-default path included.

describe("config authz — path-shaped orgs (#253 review)", () => {
  it("publish-only shepherd PUT flip in a slash-named org → 200; gate lookup and proxy both hit the ENCODED org path", async () => {
    const fetchSpy = spyFetchWithCurrent("language", {
      document: "# same\n",
      published: false,
    });
    const res = await handleConfig(
      new Request(
        `https://portal.example.test/api/config/languages/spanish?org=${encodeURIComponent("team/alpha")}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: "# same\n", published: true }),
        }
      ),
      env,
      makeSession({
        org: "team/alpha",
        language_edit_rights: [],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/spanish"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/team%2Falpha/languages/spanish"
    );
    expect(String(fetchSpy.mock.calls[1]![0])).toContain(
      "/api/v1/admin/orgs/team%2Falpha/languages/spanish"
    );
  });

  it.each([".", ".."])(
    "session.org %j with NO ?org= → 400 (validated on the resolved org, not just the param)",
    async (dots) => {
      // A param-only check misses an org literally named "." reaching
      // engine paths through the no-param session default: dots survive
      // encodeURIComponent and /orgs/../x URL-normalizes into traversal.
      const fetchSpy = spyFetch();
      const res = await handleConfig(
        makeRequest("GET", "/api/config/modes"),
        env,
        makeSession({ org: dots, isAdmin: true }),
        "/api/config/modes"
      );
      expect(res.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("?org=<trimmed echo of whitespace-padded session org> → same-org (both sides trimmed)", async () => {
    // buildConfigUrl trims the param, so a legacy stored org " team"
    // echoes back as "team" — comparing against the untrimmed session
    // value would 403 its own admin (the #247 symptom again). Resolves
    // to the RAW session.org so the engine path matches the no-param
    // branch.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/languages", "org=team"),
      env,
      makeSession({ org: " team", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/${encodeURIComponent(" team")}/languages`
    );
  });
});

// ---------------------------------------------------------------------------
// Same-org ?org= for every caller (#247)
// ---------------------------------------------------------------------------
//
// The user dialogs scope their language/mode list fetches to the target
// user's org, which for org admins is always their own org — so the param
// arrives on every request from those surfaces. Rejecting it with the
// #166 super-admin gate broke the rights selectors (and the #248
// empty-drafts CTA) for every non-super-admin: the fetch 403'd, the query
// errored, and the selector sat on "Loading…" forever (Elsy's staging
// re-test). `?org=<own org>` must resolve exactly like an absent param.

describe("config authz — same-org ?org= (#247)", () => {
  it("org admin GET languages with ?org=<own org> → proxies (no 403)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/languages", "org=acme"),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages"
    );
  });

  it("plain user GET modes with ?org=<own org> → proxies (read is open)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/modes", "org=acme"),
      env,
      makeSession({ org: "acme", isAdmin: false, isSuperAdmin: false }),
      "/api/config/modes"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes"
    );
  });

  it("?org= with spaces matches exactly against session.org (real-world org shape)", async () => {
    // Org values are free-text at creation ("Test Organization one") and
    // the portal only ever sends values read back from stored records, so
    // the same-org path always compares byte-identical strings — spaces
    // and casing included.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        `org=${encodeURIComponent("Test Organization one")}`
      ),
      env,
      makeSession({
        org: "Test Organization one",
        isAdmin: true,
        isSuperAdmin: false,
      }),
      "/api/config/languages"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/api/v1/admin/orgs/${encodeURIComponent("Test Organization one")}/languages`
    );
  });

  it("non-super ?org=<case-variant of own org> → 403 (case-variants are NOT same-org)", async () => {
    // KV keys are case-sensitive, so "ACME" is a distinct org from
    // "acme" — matching it as same-org would silently retarget the
    // request to the caller's home KV entry. Org identity stays an
    // exact compare everywhere in the worker (admin.ts does the same);
    // a case-variant from a non-super caller is a loud 403, like any
    // other org.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/languages", "org=ACME"),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("org admin PUT modes/{name} with ?org=<own org> → same-org authz applies (admin passes)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/modes/spoken", "org=acme", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "## Identity\n" }),
      }),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: false }),
      "/api/config/modes/spoken"
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/modes/spoken"
    );
  });

  it("non-super with ?org=<own org> + restricted language_rights → 403 (same-org gate not bypassed)", async () => {
    // The param must not grant anything the bare same-org path wouldn't:
    // crossOrg stays false, so per-row language_rights are enforced.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("PUT", "/api/config/languages/english", "org=acme", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: "# English\n" }),
      }),
      env,
      makeSession({
        org: "acme",
        isAdmin: false,
        isSuperAdmin: false,
        language_rights: ["spanish"],
      }),
      "/api/config/languages/english"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-super with ?org=<different case of OTHER org> → still 403", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery("GET", "/api/config/languages", "org=OTHER"),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("org admin of a slash-named org with ?org=<own org> → proxies (same-org check runs before slash reject)", async () => {
    // Org names are free-text and worker/admin.ts only trims — a
    // slash-named org is creatable, and its admins' dialog fetches echo
    // it back as ?org=. Rejecting it would resurrect the exact #247
    // dead-selector symptom (as a 400) for that org. The same-org
    // branch resolves to session.org, which handleConfig
    // encodeURIComponent's, so no path shape reaches the upstream URL.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        `org=${encodeURIComponent("team/alpha")}`
      ),
      env,
      makeSession({ org: "team/alpha", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/team%2Falpha/languages"
    );
  });

  it("super-admin CROSS-org ?org=<slash-named other org> → proxies encoded (#253 review P2)", async () => {
    // A super-admin provisioning users in a slash-named org they don't
    // sit in needs the dialogs' list fetches to resolve, same as the
    // org's own admins.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        `org=${encodeURIComponent("team/alpha")}`
      ),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/languages"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/team%2Falpha/languages"
    );
  });

  it("non-super with ?org=<slash-named OTHER org> → still 403 (cross-org gate unchanged)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequestWithQuery(
        "GET",
        "/api/config/languages",
        `org=${encodeURIComponent("team/alpha")}`
      ),
      env,
      makeSession({ org: "acme", isAdmin: true, isSuperAdmin: false }),
      "/api/config/languages"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("super-admin ?org=<case-variant of own org> → cross-org to the case-variant org (distinct KV entry stays addressable)", async () => {
    // "ACME" and "acme" are distinct KV entries. A super-admin naming
    // the case-variant must reach THAT org — resolving it as same-org
    // would silently read/write the home org's config while the caller
    // believes they're operating on the other one. This mirrors the
    // pre-#247 exact-compare behavior.
    const fetchSpy = spyFetch();
    await handleConfig(
      makeRequestWithQuery("GET", "/api/config/languages", "org=ACME"),
      env,
      makeSession({ org: "acme", isSuperAdmin: true }),
      "/api/config/languages"
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/ACME/languages"
    );
  });
});

// ---------------------------------------------------------------------------
// #249 — language admin trump (option 4: full mode parity)
// ---------------------------------------------------------------------------
//
// Anyone with admin powers (isAdmin OR isSuperAdmin) may edit, publish,
// delete and create ANY language in their own org, regardless of per-row
// verb rights — exactly as they always could for modes. Per-row rights
// keep governing non-admin shepherds, unchanged.
//
// This replaces the #247 bootstrap carve-out (a probe-gated,
// creation-only exception with a creator auto-grant), which the trump
// subsumes: creation is now an ordinary admin write, so no auto-grant,
// no existence probe, and no X-Bootstrap-Grant signal on language PUTs.

function makeLanguagePut(name: string, body: object): Request {
  return new Request(
    `https://portal.example.test/api/config/languages/${name}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("language admin trump (#249)", () => {
  it("admin with explicit empty rights PUTs an EXISTING draft → 200, single proxy fetch, no probe", async () => {
    // Pre-#249 this 403'd: PR #185 enforced per-row rights on existing
    // rows even for admins, and the #247 carve-out was creation-only.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeLanguagePut("swahili", { document: "# Swahili\n" }),
      env,
      makeSession({
        isAdmin: true,
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    // One fetch, and it is the PUT: the trump returns before the body
    // parse and the diff GET, so no existence probe is issued.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "/api/v1/admin/orgs/acme/languages/swahili"
    );
  });

  it("admin with explicit empty rights DELETEs a draft → 200 (the #247 carve-out was PUT-only)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/languages/swahili"),
      env,
      makeSession({
        isAdmin: true,
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("admin creates a MISSING draft → 200 with no creator grant and no X-Bootstrap-Grant header", async () => {
    // The #247 pipeline wrote both verb fields to the creator's KV
    // record and flagged the response. Under the trump neither happens:
    // the admin needs no rights to keep working on what they created.
    await seedRightsUser({
      email: "admin@acme.com",
      org: "acme",
      isAdmin: true,
      language_edit_rights: [],
      language_publish_rights: [],
    });
    const fetchSpy = spyFetch();

    const res = await handleConfig(
      makeLanguagePut("swahili", {
        document: "## Identity\n",
        published: false,
      }),
      env,
      makeSession({
        email: "admin@acme.com",
        isAdmin: true,
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.headers.get("X-Bootstrap-Grant")).toBeNull();

    const after = await readRightsUser("admin@acme.com");
    expect(after.language_edit_rights).toEqual([]);
    expect(after.language_publish_rights).toEqual([]);
  });

  it("admin flips published on a row they hold no publish right for → 200", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeLanguagePut("swahili", { document: "# same\n", published: true }),
      env,
      makeSession({
        isAdmin: true,
        language_edit_rights: ["spanish"],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("super-admin WITHOUT isAdmin gets the trump too (hasAdminPowers parity with modes)", async () => {
    // A super admin who self-demoted isAdmin keeps cross-org powers and
    // must keep config powers, or the partial-power state is
    // inconsistent across the worker (mirrors the mode-path test).
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeLanguagePut("swahili", { document: "# Swahili\n" }),
      env,
      makeSession({
        isAdmin: false,
        isSuperAdmin: true,
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("deadlock regression (#247): every user holds explicit non-'*' rights → an admin can still create the org's FIRST draft", async () => {
    // The original #247 bug: per-row rights can only name drafts that
    // already exist, but creating a draft required rights on it — so an
    // org whose users all hold explicit arrays could never create draft
    // one. The trump dissolves it without any bootstrap machinery.
    await seedRightsUser({
      email: "admin@acme.com",
      org: "acme",
      isAdmin: true,
      language_rights: ["en"],
      language_edit_rights: ["en"],
      language_publish_rights: ["en"],
    });
    const fetchSpy = spyFetch();

    const res = await handleConfig(
      makeLanguagePut("swahili", {
        document: "## Identity\n",
        published: false,
      }),
      env,
      makeSession({
        email: "admin@acme.com",
        isAdmin: true,
        language_rights: ["en"],
        language_edit_rights: ["en"],
        language_publish_rights: ["en"],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Rights are untouched: the admin's access comes from the trump, so
    // nothing is written to KV on their behalf.
    const after = await readRightsUser("admin@acme.com");
    expect(after.language_edit_rights).toEqual(["en"]);
    expect(after.language_publish_rights).toEqual(["en"]);
  });

  it("non-admin with explicit [] → 403 on PUT (existing row), engine never touched", async () => {
    // The trump is admin-only; with the #247 exemption gone, the
    // early-deny fires before the body is read.
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeLanguagePut("swahili", { document: "# Swahili\n" }),
      env,
      makeSession({
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with explicit [] → 403 on PUT of a MISSING name (no creation path for shepherds)", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeLanguagePut("brand-new", {
        document: "## Identity\n",
        published: false,
      }),
      env,
      makeSession({
        language_edit_rights: ["spanish"],
        language_publish_rights: ["spanish"],
      }),
      "/api/config/languages/brand-new"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("non-admin with explicit [] → 403 on DELETE, engine never touched", async () => {
    const fetchSpy = spyFetch();
    const res = await handleConfig(
      makeRequest("DELETE", "/api/config/languages/swahili"),
      env,
      makeSession({
        language_edit_rights: [],
        language_publish_rights: [],
      }),
      "/api/config/languages/swahili"
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
