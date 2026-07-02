import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  contractOrgModeRights,
  expandOrgModeRights,
  expandRights,
  removeSlugIfPartnerPresent,
} from "../worker/rights-migration";
import type { StoredUser } from "../worker/types";

// #240 — the invariant these helpers enforce end-to-end: at every
// intermediate point of expand → engine op → contract/compensate, a
// user's rights cover whichever slug is live. The pure functions below
// are the whole guarantee; the orchestration tests pin the recorded-set
// semantics (cleanup only ever touches users the expand actually
// modified).

describe("expandRights", () => {
  it("adds the new slug alongside the old, sorted", () => {
    expect(expandRights(["spoken"], "spoken", "conversation")).toEqual([
      "conversation",
      "spoken",
    ]);
    expect(expandRights(["b", "spoken", "a"], "spoken", "z")).toEqual([
      "a",
      "b",
      "spoken",
      "z",
    ]);
  });

  it("null (no change) when the old slug isn't held", () => {
    expect(expandRights(["other"], "spoken", "conversation")).toBeNull();
    expect(expandRights([], "spoken", "conversation")).toBeNull();
  });

  it("null when the new slug is already held (idempotent)", () => {
    expect(
      expandRights(["conversation", "spoken"], "spoken", "conversation")
    ).toBeNull();
  });

  it("wildcard and undefined pass through untouched", () => {
    expect(expandRights("*", "spoken", "conversation")).toBeNull();
    expect(expandRights(undefined, "spoken", "conversation")).toBeNull();
  });
});

describe("removeSlugIfPartnerPresent", () => {
  it("removes only when the partner is present", () => {
    expect(
      removeSlugIfPartnerPresent(
        ["conversation", "spoken"],
        "spoken",
        "conversation"
      )
    ).toEqual(["conversation"]);
  });

  it("null when the partner is absent — never shrinks below the live slug", () => {
    // The load-bearing guard: contract/compensate can run against any
    // intermediate state without ever removing a user's only live slug.
    expect(
      removeSlugIfPartnerPresent(["spoken"], "spoken", "conversation")
    ).toBeNull();
  });

  it("null when the removal target isn't held (idempotent)", () => {
    expect(
      removeSlugIfPartnerPresent(["conversation"], "spoken", "conversation")
    ).toBeNull();
  });

  it("wildcard and undefined pass through untouched", () => {
    expect(removeSlugIfPartnerPresent("*", "spoken", "x")).toBeNull();
    expect(removeSlugIfPartnerPresent(undefined, "spoken", "x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Orchestration over AUTH_KV
// ---------------------------------------------------------------------------

async function seed(
  email: string,
  org: string,
  fields: Partial<
    Pick<StoredUser, "mode_edit_rights" | "mode_publish_rights">
  > = {}
): Promise<string> {
  const key = `user:${email}`;
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name: email,
    org,
    passwordHash: "x",
    salt: "x",
    isAdmin: false,
    ...fields,
  };
  await env.AUTH_KV.put(key, JSON.stringify(stored));
  return key;
}

async function read(email: string): Promise<StoredUser> {
  const user = await env.AUTH_KV.get<StoredUser>(`user:${email}`, {
    type: "json",
  });
  if (!user) throw new Error(`missing seed: ${email}`);
  return user;
}

describe("expandOrgModeRights", () => {
  it("expands both verb fields for affected org users, returns their keys", async () => {
    const key = await seed("a@acme.com", "acme", {
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["spoken", "zulu"],
    });
    await seed("b@acme.com", "acme", { mode_edit_rights: ["other"] });

    const written = await expandOrgModeRights(
      env,
      "acme",
      "spoken",
      "conversation"
    );
    expect(written).toEqual([key]);

    const after = await read("a@acme.com");
    expect(after.mode_edit_rights).toEqual(["conversation", "spoken"]);
    expect(after.mode_publish_rights).toEqual([
      "conversation",
      "spoken",
      "zulu",
    ]);
    expect((await read("b@acme.com")).mode_edit_rights).toEqual(["other"]);
  });

  it("skips users outside the org and users already holding the new slug", async () => {
    await seed("other-org@wc.com", "word-collective", {
      mode_edit_rights: ["spoken"],
    });
    await seed("both@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });

    const written = await expandOrgModeRights(
      env,
      "acme",
      "spoken",
      "conversation"
    );
    expect(written).toEqual([]);
    expect((await read("other-org@wc.com")).mode_edit_rights).toEqual([
      "spoken",
    ]);
    expect((await read("both@acme.com")).mode_edit_rights).toEqual([
      "conversation",
      "spoken",
    ]);
  });
});

describe("contractOrgModeRights", () => {
  it("removes the slug only from the given keys, partner-guarded", async () => {
    const migrated = await seed("m@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });
    // Same shape, but NOT in the recorded set — must be untouched.
    await seed("outside@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });

    await contractOrgModeRights(env, [migrated], "spoken", "conversation");

    expect((await read("m@acme.com")).mode_edit_rights).toEqual([
      "conversation",
    ]);
    expect((await read("outside@acme.com")).mode_edit_rights).toEqual([
      "conversation",
      "spoken",
    ]);
  });

  it("leaves a user alone when the partner slug is missing", async () => {
    // Defensive: if state drifted between phases (concurrent admin
    // edit removed the new slug), contract must not strip the old one.
    const key = await seed("drift@acme.com", "acme", {
      mode_edit_rights: ["spoken"],
    });
    await contractOrgModeRights(env, [key], "spoken", "conversation");
    expect((await read("drift@acme.com")).mode_edit_rights).toEqual(["spoken"]);
  });

  it("tolerates keys whose records vanished", async () => {
    await expect(
      contractOrgModeRights(env, ["user:gone@acme.com"], "a", "b")
    ).resolves.toBeUndefined();
  });
});
