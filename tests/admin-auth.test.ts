import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { handleAdmin } from "../worker/admin";
import { generateSalt, hashPassword } from "../worker/crypto";
import type { LanguageRights, SessionData, StoredUser } from "../worker/types";

const ADMIN_SECRET = "test-admin-secret";

interface SeedUserInput {
  id?: string;
  email: string;
  name: string;
  org: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  language_rights?: LanguageRights;
}

async function seedUser(input: SeedUserInput): Promise<StoredUser> {
  const salt = generateSalt();
  const passwordHash = await hashPassword("test-password", salt);
  const stored: StoredUser = {
    id: input.id ?? crypto.randomUUID(),
    email: input.email,
    name: input.name,
    org: input.org,
    passwordHash,
    salt,
    isAdmin: input.isAdmin ?? false,
    isSuperAdmin: input.isSuperAdmin ?? false,
    language_rights: input.language_rights,
  };
  await env.AUTH_KV.put(`user:${input.email}`, JSON.stringify(stored));
  return stored;
}

async function seedSession(user: StoredUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: SessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    org: user.org,
    isAdmin: user.isAdmin ?? false,
    isSuperAdmin: user.isSuperAdmin ?? false,
    createdAt: new Date().toISOString(),
    language_rights: user.language_rights,
  };
  await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session));
  return sessionId;
}

interface MakeReqOpts {
  method: string;
  pathname: string;
  headers?: Record<string, string>;
  body?: unknown;
  sessionId?: string;
}

function makeRequest(opts: MakeReqOpts): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.sessionId) {
    const existing = headers.get("Cookie");
    headers.set(
      "Cookie",
      existing
        ? `${existing}; session=${opts.sessionId}`
        : `session=${opts.sessionId}`
    );
  }
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(`https://portal.example.test${opts.pathname}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function call(
  opts: MakeReqOpts
): Promise<{ status: number; body: unknown }> {
  const res = await handleAdmin(makeRequest(opts), env, opts.pathname);
  // Parse body if there is one. errorResponse returns JSON; jsonResponse too.
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, body };
}

beforeEach(async () => {
  // Wipe AUTH_KV between tests so seed state doesn't leak.
  let cursor: string | undefined;
  do {
    const list = await env.AUTH_KV.list({ cursor });
    for (const key of list.keys) {
      await env.AUTH_KV.delete(key.name);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
});

// ---------------------------------------------------------------------------
// X-Admin-Secret path (super scope)
// ---------------------------------------------------------------------------

describe("admin auth — X-Admin-Secret (super scope)", () => {
  it("valid secret → 200, lists users from all orgs", async () => {
    await seedUser({ email: "alice@acme.com", name: "Alice", org: "acme" });
    await seedUser({ email: "bob@other.com", name: "Bob", org: "other" });

    const { status, body } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
    });

    expect(status).toBe(200);
    const users = (body as { users: { org: string }[] }).users;
    expect(users).toHaveLength(2);
    expect(new Set(users.map((u) => u.org))).toEqual(
      new Set(["acme", "other"])
    );
  });

  it("invalid secret + no XHR header → 403", async () => {
    const { status } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": "WRONG" },
    });
    expect(status).toBe(403);
  });

  it("no auth at all → 403", async () => {
    const { status } = await call({
      method: "GET",
      pathname: "/api/admin/users",
    });
    expect(status).toBe(403);
  });

  it("super scope can move user across orgs", async () => {
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: { org: "other" },
    });

    expect(status).toBe(200);
    expect((body as { user: { org: string } }).user.org).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// Cookie path (org scope)
// ---------------------------------------------------------------------------

describe("admin auth — session cookie (org scope)", () => {
  it("isAdmin + XHR → 200, list filtered to caller's org", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({ email: "bob@acme.com", name: "Bob", org: "acme" });
    await seedUser({ email: "carol@other.com", name: "Carol", org: "other" });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(200);
    const users = (body as { users: { email: string; org: string }[] }).users;
    expect(users).toHaveLength(2);
    expect(users.every((u) => u.org === "acme")).toBe(true);
  });

  it("isAdmin=false + XHR → 403", async () => {
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
      isAdmin: false,
    });
    const session = await seedSession(bob);

    const { status } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(403);
  });

  it("isAdmin + missing XHR header → 403 (CSRF guard)", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      sessionId: session,
    });

    expect(status).toBe(403);
  });

  it("cross-org PUT → 404 (avoid enumeration)", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({ email: "carol@other.com", name: "Carol", org: "other" });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "PUT",
      pathname: "/api/admin/users/carol@other.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { name: "Hacked" },
    });

    expect(status).toBe(404);
  });

  it("cross-org DELETE → 404 (avoid enumeration)", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({ email: "carol@other.com", name: "Carol", org: "other" });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "DELETE",
      pathname: "/api/admin/users/carol@other.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(404);
  });

  it("attempt to move user to another org → 403", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({ email: "bob@acme.com", name: "Bob", org: "acme" });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "PUT",
      pathname: "/api/admin/users/bob@acme.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { org: "other" },
    });

    expect(status).toBe(403);
  });

  it("attempt to create user in another org → 403", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "newuser@other.com",
        password: "pw",
        name: "New",
        org: "other",
      },
    });

    expect(status).toBe(403);
  });

  it("create user in own org → 201", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "newuser@acme.com",
        password: "pw-newuser",
        name: "New",
        org: "acme",
      },
    });

    expect(status).toBe(201);
    expect((body as { user: { email: string } }).user.email).toBe(
      "newuser@acme.com"
    );
  });

  it("self-delete → 400", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "DELETE",
      pathname: "/api/admin/users/alice@acme.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(400);
    // User should still exist
    const stillThere = await env.AUTH_KV.get("user:alice@acme.com");
    expect(stillThere).not.toBeNull();
  });

  it("self-demote → 400", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "PUT",
      pathname: "/api/admin/users/alice@acme.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isAdmin: false },
    });

    expect(status).toBe(400);
    // Should still be admin
    const record = await env.AUTH_KV.get<StoredUser>("user:alice@acme.com", {
      type: "json",
    });
    expect(record?.isAdmin).toBe(true);
  });

  it("can demote a different admin in same org", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "PUT",
      pathname: "/api/admin/users/bob@acme.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isAdmin: false },
    });

    expect(status).toBe(200);
    expect((body as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false);
  });

  it("can assign language_rights on a user in own org", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    await seedUser({ email: "bob@acme.com", name: "Bob", org: "acme" });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "PUT",
      pathname: "/api/admin/users/bob@acme.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { language_rights: ["es", "en"] },
    });

    expect(status).toBe(200);
    expect(
      (body as { user: { language_rights: LanguageRights } }).user
        .language_rights
    ).toEqual(["es", "en"]);
  });
});

// ---------------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------------

describe("admin password policy", () => {
  it("create user with <8 char password → 400 (X-Admin-Secret path)", async () => {
    const { status, body } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: {
        email: "newuser@acme.com",
        password: "short",
        name: "New",
        org: "acme",
      },
    });

    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/at least 8/);
    // The user should not have been created
    const record = await env.AUTH_KV.get("user:newuser@acme.com");
    expect(record).toBeNull();
  });

  it("create user with 8-char password → 201 (X-Admin-Secret path)", async () => {
    const { status } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: {
        email: "newuser@acme.com",
        password: "exactly8",
        name: "New",
        org: "acme",
      },
    });

    expect(status).toBe(201);
  });

  it("create user with <8 char password → 400 (cookie path)", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "newuser@acme.com",
        password: "short",
        name: "New",
        org: "acme",
      },
    });

    expect(status).toBe(400);
  });

  it("update user password with <8 chars → 400", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { password: "short" },
    });

    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/at least 8/);
  });

  it("update user with empty-string password → 400 (not silent no-op)", async () => {
    // `if (body.password)` is falsy on "" and would skip validation entirely,
    // returning 200 with no password change. The fix uses
    // `body.password !== undefined` so empty string hits the policy check.
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const originalHash = bob.passwordHash;
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { password: "" },
    });

    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/at least 8/);
    // Stored hash must be unchanged.
    const after = await env.AUTH_KV.get<StoredUser>("user:bob@acme.com", {
      type: "json",
    });
    expect(after?.passwordHash).toBe(originalHash);
  });

  it("create user with >128 char password → 400", async () => {
    const longPassword = "x".repeat(129);
    const { status, body } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: {
        email: "newuser@acme.com",
        password: longPassword,
        name: "New",
        org: "acme",
      },
    });

    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/at most 128/);
  });

  it("cross-org POST with short password → 403 (org-scope check runs first)", async () => {
    // Existing test in this file relies on this ordering — if we ever
    // re-order the validations, the cross-org-403 test would silently start
    // returning 400 (password-too-short) instead. Pin the precedence.
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "newuser@other.com",
        password: "short",
        name: "New",
        org: "other",
      },
    });

    expect(status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Password reset → session invalidation (#99)
// ---------------------------------------------------------------------------

// Helper: count sessions in AUTH_KV whose stored email matches `email`.
async function countSessionsForEmail(email: string): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  do {
    const page = await env.AUTH_KV.list({ prefix: "session:", cursor });
    for (const key of page.keys) {
      const sess = await env.AUTH_KV.get<SessionData>(key.name, {
        type: "json",
      });
      if (sess?.email === email) count += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

describe("admin password-reset → session invalidation (#99)", () => {
  it("cookie path: admin resets another user's password → target's sessions deleted, caller's session intact", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const aliceSession = await seedSession(alice);
    // Bob has two active sessions (e.g., laptop + phone).
    await seedSession(bob);
    await seedSession(bob);

    expect(await countSessionsForEmail(bob.email)).toBe(2);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: aliceSession,
      body: { password: "new-password-123" },
    });

    expect(status).toBe(200);
    expect(await countSessionsForEmail(bob.email)).toBe(0);
    // Alice's session must still validate — her cookie shouldn't get
    // collateral-damaged by Bob's reset.
    expect(await countSessionsForEmail(alice.email)).toBe(1);
  });

  it("cookie path: admin resets own password → current session preserved, other own-email sessions deleted", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    // Alice is logged in on two devices; she resets her own password from
    // the first one. The first session is the caller; the second should
    // be invalidated.
    const aliceCurrentSession = await seedSession(alice);
    await seedSession(alice);

    expect(await countSessionsForEmail(alice.email)).toBe(2);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${alice.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: aliceCurrentSession,
      body: { password: "new-alice-password" },
    });

    expect(status).toBe(200);
    // Only the caller's session survives.
    expect(await countSessionsForEmail(alice.email)).toBe(1);
    const surviving = await env.AUTH_KV.get(`session:${aliceCurrentSession}`);
    expect(surviving).not.toBeNull();
  });

  it("X-Admin-Secret path: resets another user's password → all target sessions deleted (no caller session)", async () => {
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    await seedSession(bob);
    await seedSession(bob);
    await seedSession(bob);

    expect(await countSessionsForEmail(bob.email)).toBe(3);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: { password: "new-bob-password" },
    });

    expect(status).toBe(200);
    expect(await countSessionsForEmail(bob.email)).toBe(0);
  });

  it("PUT without password → target's sessions untouched", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const aliceSession = await seedSession(alice);
    await seedSession(bob);
    await seedSession(bob);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: aliceSession,
      body: { name: "Bob Updated", language_rights: ["es"] },
    });

    expect(status).toBe(200);
    // Bob's two sessions are both preserved — non-password PUTs must not
    // log users out.
    expect(await countSessionsForEmail(bob.email)).toBe(2);
  });

  it("failed password policy → no sessions deleted (atomic: hash is not written, sessions not killed)", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const aliceSession = await seedSession(alice);
    await seedSession(bob);
    await seedSession(bob);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: aliceSession,
      // Below the 8-char floor — must reject without touching sessions.
      body: { password: "short" },
    });

    expect(status).toBe(400);
    expect(await countSessionsForEmail(bob.email)).toBe(2);
  });

  it("password reset does not delete sessions belonging to OTHER users", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const carol = await seedUser({
      email: "carol@acme.com",
      name: "Carol",
      org: "acme",
    });
    const aliceSession = await seedSession(alice);
    await seedSession(bob);
    await seedSession(carol);
    await seedSession(carol);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: aliceSession,
      body: { password: "new-bob-password" },
    });

    expect(status).toBe(200);
    expect(await countSessionsForEmail(bob.email)).toBe(0);
    // Carol's two sessions and Alice's caller session are untouched.
    expect(await countSessionsForEmail(carol.email)).toBe(2);
    expect(await countSessionsForEmail(alice.email)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed paths
// ---------------------------------------------------------------------------

describe("admin auth — mixed paths", () => {
  it("X-Admin-Secret wins even when caller's session is non-admin", async () => {
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
      isAdmin: false,
    });
    const session = await seedSession(bob);

    const { status, body } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      sessionId: session,
    });

    expect(status).toBe(200);
    // Super scope listed all (just Bob in this test)
    expect((body as { users: unknown[] }).users).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Session super-admin (#138 — super-by-session scope)
// ---------------------------------------------------------------------------
//
// Super-admin via cookie is the cross-org browser role. It mirrors the
// X-Admin-Secret super scope's powers (cross-org list/create/move/delete,
// can grant/revoke isSuperAdmin) but is subject to the self-mutation guards
// the cookie path enforces (no self-delete; no self-demote of isSuperAdmin —
// which would lock the caller out of cross-org powers).

describe("admin auth — session super-admin (super-by-session scope)", () => {
  it("isSuperAdmin + XHR → 200, lists users from ALL orgs", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    await seedUser({ email: "alice@acme.com", name: "Alice", org: "acme" });
    await seedUser({ email: "carol@other.com", name: "Carol", org: "other" });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(200);
    const users = (body as { users: { email: string; org: string }[] }).users;
    expect(users).toHaveLength(3);
    expect(new Set(users.map((u) => u.org))).toEqual(
      new Set(["tools", "acme", "other"])
    );
  });

  it("isSuperAdmin without isAdmin still passes admin auth (super trumps)", async () => {
    // Edge case: a user explicitly demoted from isAdmin but still flagged
    // isSuperAdmin should still get in. This is the "super trumps" rule —
    // without it, demoting your own isAdmin would silently lock you out
    // even though you still hold super.
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: false,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(200);
  });

  it("can create user in a different org (bootstrap-new-org path)", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "haneen@haneen.org",
        password: "haneen-pw-123",
        name: "Haneen",
        org: "haneen",
        isAdmin: true,
      },
    });

    expect(status).toBe(201);
    const user = (body as { user: { org: string; email: string } }).user;
    expect(user.org).toBe("haneen");
    expect(user.email).toBe("haneen@haneen.org");
  });

  it("can move a user across orgs", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { org: "other" },
    });

    expect(status).toBe(200);
    expect((body as { user: { org: string } }).user.org).toBe("other");
  });

  it("can delete a user in another org", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    await seedUser({ email: "carol@other.com", name: "Carol", org: "other" });
    const session = await seedSession(seth);

    const { status } = await call({
      method: "DELETE",
      pathname: "/api/admin/users/carol@other.com",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(200);
    expect(await env.AUTH_KV.get("user:carol@other.com")).toBeNull();
  });

  it("can grant isSuperAdmin to another user", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const ian = await seedUser({
      email: "ian@example.com",
      name: "Ian",
      org: "tools",
      isAdmin: true,
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${ian.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isSuperAdmin: true },
    });

    expect(status).toBe(200);
    expect(
      (body as { user: { isSuperAdmin: boolean } }).user.isSuperAdmin
    ).toBe(true);
  });

  it("cannot self-demote isSuperAdmin (would lock out of cross-org)", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isSuperAdmin: false },
    });

    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/super admin/i);
    // Stored record must be unchanged.
    const record = await env.AUTH_KV.get<StoredUser>(`user:${seth.email}`, {
      type: "json",
    });
    expect(record?.isSuperAdmin).toBe(true);
  });

  it("CAN self-demote isAdmin (super remains, no lockout)", async () => {
    // Mirror of the org-admin self-demote test. For super-by-session, the
    // isAdmin self-demote guard does NOT apply because the caller retains
    // cross-org powers via isSuperAdmin regardless of isAdmin.
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isAdmin: false },
    });

    expect(status).toBe(200);
    expect((body as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false);
  });

  it("cannot self-delete", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status } = await call({
      method: "DELETE",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(400);
    expect(await env.AUTH_KV.get(`user:${seth.email}`)).not.toBeNull();
  });

  it("self-password-reset preserves caller's session (mirrors org-admin path)", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const callerSession = await seedSession(seth);
    // Another active session on a different device.
    await seedSession(seth);
    expect(await countSessionsForEmail(seth.email)).toBe(2);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: callerSession,
      body: { password: "new-seth-password" },
    });

    expect(status).toBe(200);
    // Only the caller's session survives.
    expect(await countSessionsForEmail(seth.email)).toBe(1);
    expect(await env.AUTH_KV.get(`session:${callerSession}`)).not.toBeNull();
  });

  it("isSuperAdmin field is returned by safeUser in list response", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(seth);

    const { status, body } = await call({
      method: "GET",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
    });

    expect(status).toBe(200);
    const users = (
      body as { users: { email: string; isSuperAdmin: boolean }[] }
    ).users;
    expect(users.find((u) => u.email === seth.email)?.isSuperAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Org admin scope cannot escalate via isSuperAdmin
// ---------------------------------------------------------------------------
//
// Defense-in-depth: an org admin POST/PUT carrying isSuperAdmin must be
// rejected loud (403). Silent drop would mask UI bugs and let an attacker
// repeatedly probe the field hoping for a missing check.

describe("admin auth — org admin cannot touch isSuperAdmin", () => {
  it("org admin POST with isSuperAdmin → 403, user not created", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "POST",
      pathname: "/api/admin/users",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: {
        email: "mallory@acme.com",
        password: "mallory-pw-123",
        name: "Mallory",
        org: "acme",
        isSuperAdmin: true,
      },
    });

    expect(status).toBe(403);
    expect((body as { error: string }).error).toMatch(/isSuperAdmin/);
    expect(await env.AUTH_KV.get("user:mallory@acme.com")).toBeNull();
  });

  it("org admin PUT with isSuperAdmin → 403, stored record unchanged", async () => {
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const bob = await seedUser({
      email: "bob@acme.com",
      name: "Bob",
      org: "acme",
    });
    const session = await seedSession(alice);

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${bob.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isSuperAdmin: true },
    });

    expect(status).toBe(403);
    expect((body as { error: string }).error).toMatch(/isSuperAdmin/);
    const after = await env.AUTH_KV.get<StoredUser>(`user:${bob.email}`, {
      type: "json",
    });
    expect(after?.isSuperAdmin ?? false).toBe(false);
  });

  it("org admin PUT with isSuperAdmin:false (no-op revoke) also rejects → 403", async () => {
    // Even revoking is forbidden — an org admin couldn't have granted it in
    // the first place, so they shouldn't be able to strip a co-worker's
    // super-admin either. Symmetric to the grant block.
    const alice = await seedUser({
      email: "alice@acme.com",
      name: "Alice",
      org: "acme",
      isAdmin: true,
    });
    const ian = await seedUser({
      email: "ian@acme.com",
      name: "Ian",
      org: "acme",
      isAdmin: true,
      isSuperAdmin: true,
    });
    const session = await seedSession(alice);

    const { status } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${ian.email}`,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      sessionId: session,
      body: { isSuperAdmin: false },
    });

    expect(status).toBe(403);
    const after = await env.AUTH_KV.get<StoredUser>(`user:${ian.email}`, {
      type: "json",
    });
    expect(after?.isSuperAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// X-Admin-Secret retains all super powers (regression for #138)
// ---------------------------------------------------------------------------

describe("admin auth — X-Admin-Secret retains super powers post-#138", () => {
  it("can grant isSuperAdmin via X-Admin-Secret (bootstrap path)", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
    });

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: { isSuperAdmin: true },
    });

    expect(status).toBe(200);
    expect(
      (body as { user: { isSuperAdmin: boolean } }).user.isSuperAdmin
    ).toBe(true);
  });

  it("can revoke isSuperAdmin from any user (recovery path)", async () => {
    const seth = await seedUser({
      email: "seth@example.com",
      name: "Seth",
      org: "tools",
      isAdmin: true,
      isSuperAdmin: true,
    });

    const { status, body } = await call({
      method: "PUT",
      pathname: `/api/admin/users/${seth.email}`,
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: { isSuperAdmin: false },
    });

    expect(status).toBe(200);
    expect(
      (body as { user: { isSuperAdmin: boolean } }).user.isSuperAdmin
    ).toBe(false);
  });
});
