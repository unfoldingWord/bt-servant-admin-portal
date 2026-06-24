import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { handleMe } from "../worker/auth";
import { generateSalt, hashPassword } from "../worker/crypto";
import type { LanguageRights, SessionData, StoredUser } from "../worker/types";

// Covers the lazy-mapping in validateSession (#181 PR 1) by exercising it
// through handleMe — the simplest endpoint that surfaces session shape to
// the client. The same fallback runs in handleLogin's session-construction
// path; admin-auth tests cover the create/update/list surface.

interface SeedUserInput {
  email: string;
  name: string;
  org: string;
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}

async function seedUser(input: SeedUserInput): Promise<StoredUser> {
  const salt = generateSalt();
  const passwordHash = await hashPassword("test-password", salt);
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    email: input.email,
    name: input.name,
    org: input.org,
    passwordHash,
    salt,
    isAdmin: false,
    isSuperAdmin: false,
    language_rights: input.language_rights,
    language_edit_rights: input.language_edit_rights,
    language_publish_rights: input.language_publish_rights,
    mode_edit_rights: input.mode_edit_rights,
    mode_publish_rights: input.mode_publish_rights,
  };
  await env.AUTH_KV.put(`user:${input.email}`, JSON.stringify(stored));
  return stored;
}

// Seeds a SessionData record with the legacy (pre-#181) shape — only
// `language_rights`, no verb-perms fields. This mirrors what's actually in
// KV for sessions issued before #181 ships, and verifies the lazy-mapping
// runs at re-hydration time rather than depending on the persisted shape.
async function seedLegacySession(user: StoredUser): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: SessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    org: user.org,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: new Date().toISOString(),
    language_rights: user.language_rights,
  };
  await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session));
  return sessionId;
}

interface MeUserResponse {
  language_rights?: LanguageRights;
  language_edit_rights?: LanguageRights;
  language_publish_rights?: LanguageRights;
  mode_edit_rights?: LanguageRights;
  mode_publish_rights?: LanguageRights;
}

async function callMe(sessionId: string): Promise<MeUserResponse> {
  const res = await handleMe(
    new Request("https://portal.example.test/api/me", {
      method: "GET",
      headers: { Cookie: `session=${sessionId}` },
    }),
    env
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: MeUserResponse };
  return body.user;
}

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

describe("validateSession lazy-mapping (#181) — via handleMe", () => {
  it("legacy user with language_rights: ['en'] → both language verb-perms fields map to ['en']", async () => {
    const user = await seedUser({
      email: "legacy@acme.com",
      name: "Legacy",
      org: "acme",
      language_rights: ["en"],
    });
    const session = await seedLegacySession(user);

    const me = await callMe(session);
    expect(me.language_rights).toEqual(["en"]);
    expect(me.language_edit_rights).toEqual(["en"]);
    expect(me.language_publish_rights).toEqual(["en"]);
    // Mode rights have no legacy source — stay undefined.
    expect(me.mode_edit_rights).toBeUndefined();
    expect(me.mode_publish_rights).toBeUndefined();
  });

  it("legacy user with language_rights: '*' → both language verb-perms fields map to '*'", async () => {
    const user = await seedUser({
      email: "wildcard@acme.com",
      name: "Wildcard",
      org: "acme",
      language_rights: "*",
    });
    const session = await seedLegacySession(user);

    const me = await callMe(session);
    expect(me.language_rights).toBe("*");
    expect(me.language_edit_rights).toBe("*");
    expect(me.language_publish_rights).toBe("*");
    expect(me.mode_edit_rights).toBeUndefined();
    expect(me.mode_publish_rights).toBeUndefined();
  });

  // `undefined` is the pre-permission-system default and means "full access
  // for back-compat" per worker/types.ts. The lazy fallback must preserve
  // that — propagating `undefined` to both verb-perms fields so the
  // existing back-compat behavior is unchanged.
  it("legacy user with language_rights: undefined → both language verb-perms stay undefined", async () => {
    const user = await seedUser({
      email: "pre-perms@acme.com",
      name: "Pre Perms",
      org: "acme",
    });
    const session = await seedLegacySession(user);

    const me = await callMe(session);
    expect(me.language_rights).toBeUndefined();
    expect(me.language_edit_rights).toBeUndefined();
    expect(me.language_publish_rights).toBeUndefined();
    expect(me.mode_edit_rights).toBeUndefined();
    expect(me.mode_publish_rights).toBeUndefined();
  });

  // Once an admin has set the verb-perms fields explicitly (PR 2 path), the
  // lazy fallback must not clobber them — explicit value wins over the
  // legacy source. Catches the bug shape where the `??` was accidentally
  // reversed.
  it("user with explicit language_edit_rights → fallback does NOT override the explicit value", async () => {
    const user = await seedUser({
      email: "explicit@acme.com",
      name: "Explicit",
      org: "acme",
      language_rights: ["en"], // legacy says "en"
      language_edit_rights: ["en", "es", "fr"], // but explicit says "en, es, fr"
    });
    const session = await seedLegacySession(user);

    const me = await callMe(session);
    expect(me.language_edit_rights).toEqual(["en", "es", "fr"]);
    // Publish has no explicit value — still falls back to legacy.
    expect(me.language_publish_rights).toEqual(["en"]);
  });

  it("user with explicit mode_edit_rights → passes through verbatim (no legacy source to interfere)", async () => {
    const user = await seedUser({
      email: "mode-perms@acme.com",
      name: "Mode Perms",
      org: "acme",
      language_rights: ["en"],
      mode_edit_rights: ["bible-study", "trainer"],
      mode_publish_rights: "*",
    });
    const session = await seedLegacySession(user);

    const me = await callMe(session);
    expect(me.mode_edit_rights).toEqual(["bible-study", "trainer"]);
    expect(me.mode_publish_rights).toBe("*");
  });
});
