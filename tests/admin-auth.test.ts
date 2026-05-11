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
