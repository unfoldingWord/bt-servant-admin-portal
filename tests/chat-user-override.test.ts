import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleDeleteHistory, handleHistory } from "../worker/chat";
import type { SessionData, StoredUser } from "../worker/types";

// The user_id override exists for the test-chat panel's synthetic UUIDs.
// Portal user IDs are ALSO crypto.randomUUID(), so shape-validation alone
// was an IDOR: any authenticated user could read or delete a colleague's
// history/memory by passing their id (#253 review). The worker is the
// only enforcement point under the trusted-portal model.

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  let cursor: string | undefined;
  do {
    const list = await env.AUTH_KV.list({ cursor });
    for (const key of list.keys) {
      await env.AUTH_KV.delete(key.name);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
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

async function seedStoredUser(email: string): Promise<StoredUser> {
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name: "Someone",
    org: "acme",
    passwordHash: "x",
    salt: "y",
    isAdmin: false,
  };
  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(stored));
  return stored;
}

function spyFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ entries: [] }), { status: 200 })
      )
    );
}

describe("chat user_id override — real-user IDOR guard (#253)", () => {
  it("DELETE history targeting another stored user's id → 403, engine untouched", async () => {
    const victim = await seedStoredUser("victim@acme.com");
    const fetchSpy = spyFetch();
    const res = await handleDeleteHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${victim.id}`,
        { method: "DELETE" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("GET history targeting another stored user's id → 403 (reads are covered too)", async () => {
    const victim = await seedStoredUser("victim@acme.com");
    const fetchSpy = spyFetch();
    const res = await handleHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${victim.id}`,
        { method: "GET" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("UPPERCASED victim UUID → still 403 (guard compares case-insensitively)", async () => {
    // UUID_V4_RE accepts uppercase hex; stored ids are lowercase. A
    // case-sensitive compare would let an uppercased copy of the
    // victim's id slip past the scan (#253 review round 6).
    const victim = await seedStoredUser("victim@acme.com");
    const fetchSpy = spyFetch();
    const res = await handleDeleteHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${victim.id.toUpperCase()}`,
        { method: "DELETE" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("synthetic UUID override (matches no stored user) → proxies as before", async () => {
    await seedStoredUser("someone@acme.com");
    const synthetic = crypto.randomUUID();
    const fetchSpy = spyFetch();
    const res = await handleHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${synthetic}`,
        { method: "GET" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/users/${synthetic}/`
    );
  });

  it("caller's OWN id as override → proxies (self-targeting is fine)", async () => {
    const session = makeSession();
    // The caller may also exist as a stored user — their own id must pass.
    const self: StoredUser = {
      id: session.userId,
      email: session.email,
      name: session.name,
      org: session.org,
      passwordHash: "x",
      salt: "y",
      isAdmin: false,
    };
    await env.AUTH_KV.put(`user:${session.email}`, JSON.stringify(self));
    const fetchSpy = spyFetch();
    const res = await handleHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${session.userId}`,
        { method: "GET" }
      ),
      env,
      session
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("KV error during the scan → 503 fail-closed, engine untouched, error logged", async () => {
    // The guard must not fail OPEN: an induced storage error would
    // otherwise bypass the IDOR check entirely.
    const fetchSpy = spyFetch();
    vi.spyOn(env.AUTH_KV, "list").mockRejectedValue(new Error("kv blip"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleDeleteHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${crypto.randomUUID()}`,
        { method: "DELETE" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("non-matching UPPERCASE override forwards VERBATIM (engine-side ids may be case-sensitive)", async () => {
    await seedStoredUser("someone@acme.com");
    const syntheticUpper = crypto.randomUUID().toUpperCase();
    const fetchSpy = spyFetch();
    const res = await handleHistory(
      new Request(
        `https://portal.example.test/api/chat/history?user_id=${syntheticUpper}`,
        { method: "GET" }
      ),
      env,
      makeSession()
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/users/${syntheticUpper}/`
    );
  });

  it("no override → session.userId (unchanged default path)", async () => {
    const session = makeSession();
    const fetchSpy = spyFetch();
    const res = await handleHistory(
      new Request("https://portal.example.test/api/chat/history", {
        method: "GET",
      }),
      env,
      session
    );
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      `/users/${session.userId}/`
    );
  });
});
