import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  // Belt-and-suspenders for the KV put spy below: if its expected
  // rejection ever stops occurring, an inline mockRestore would be
  // skipped and the rejecting mock would leak into every later test.
  vi.restoreAllMocks();
});

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
  it("appends the new slug alongside the old WITHOUT reordering", () => {
    // Order preservation is load-bearing: a failed rename must be
    // write-neutral (expand + compensate restores the exact original
    // array), so expand can't sort as a side effect.
    expect(expandRights(["spoken"], "spoken", "conversation")).toEqual([
      "spoken",
      "conversation",
    ]);
    expect(expandRights(["b", "spoken", "a"], "spoken", "z")).toEqual([
      "b",
      "spoken",
      "a",
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
  it("expands both verb fields for affected org users, returns per-field records", async () => {
    const key = await seed("a@acme.com", "acme", {
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["spoken", "zulu"],
    });
    await seed("b@acme.com", "acme", { mode_edit_rights: ["other"] });

    const records = await expandOrgModeRights(
      env,
      "acme",
      "spoken",
      "conversation"
    );
    expect(records).toEqual([
      { key, fields: ["mode_edit_rights", "mode_publish_rights"] },
    ]);

    const after = await read("a@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken", "conversation"]);
    expect(after.mode_publish_rights).toEqual([
      "spoken",
      "zulu",
      "conversation",
    ]);
    expect((await read("b@acme.com")).mode_edit_rights).toEqual(["other"]);
  });

  it("records ONLY the fields it modified (per-field, not per-user)", async () => {
    // The F4-review scenario setup: the publish field already legit-
    // imately holds the new slug, so expand must touch (and record)
    // only the edit field.
    const key = await seed("mixed@acme.com", "acme", {
      mode_edit_rights: ["spoken"],
      mode_publish_rights: ["conversation", "spoken"],
    });

    const records = await expandOrgModeRights(
      env,
      "acme",
      "spoken",
      "conversation"
    );
    expect(records).toEqual([{ key, fields: ["mode_edit_rights"] }]);
  });

  it("skips users outside the org and users already holding the new slug", async () => {
    await seed("other-org@wc.com", "word-collective", {
      mode_edit_rights: ["spoken"],
    });
    await seed("both@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });

    const records = await expandOrgModeRights(
      env,
      "acme",
      "spoken",
      "conversation"
    );
    expect(records).toEqual([]);
    expect((await read("other-org@wc.com")).mode_edit_rights).toEqual([
      "spoken",
    ]);
    expect((await read("both@acme.com")).mode_edit_rights).toEqual([
      "conversation",
      "spoken",
    ]);
  });

  it("partial write failure → rolls back landed writes and throws (rd-2 F11)", async () => {
    await seed("ok@acme.com", "acme", { mode_edit_rights: ["spoken"] });
    await seed("fails@acme.com", "acme", { mode_edit_rights: ["spoken"] });

    const realPut = env.AUTH_KV.put.bind(env.AUTH_KV);
    const putSpy = vi
      .spyOn(env.AUTH_KV, "put")
      .mockImplementation((key, value, options) => {
        if (key === "user:fails@acme.com") {
          return Promise.reject(new Error("simulated KV outage"));
        }
        return realPut(key, value, options);
      });

    await expect(
      expandOrgModeRights(env, "acme", "spoken", "conversation")
    ).rejects.toThrow("rights migration failed");
    putSpy.mockRestore();

    // The user whose write landed must be rolled back to pre-expand
    // state; the failed one never persisted.
    expect((await read("ok@acme.com")).mode_edit_rights).toEqual(["spoken"]);
    expect((await read("fails@acme.com")).mode_edit_rights).toEqual(["spoken"]);
  });
});

describe("contractOrgModeRights", () => {
  it("removes the slug only from recorded keys, partner-guarded", async () => {
    const migrated = await seed("m@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });
    // Same shape, but NOT in the recorded set — must be untouched.
    await seed("outside@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
    });

    await contractOrgModeRights(
      env,
      [{ key: migrated, fields: ["mode_edit_rights"] }],
      "spoken",
      "conversation"
    );

    expect((await read("m@acme.com")).mode_edit_rights).toEqual([
      "conversation",
    ]);
    expect((await read("outside@acme.com")).mode_edit_rights).toEqual([
      "conversation",
      "spoken",
    ]);
  });

  it("touches ONLY recorded fields — pre-existing grant in the other field survives compensation (rd-2 F4)", async () => {
    // The confirmed F4 scenario: expand modified only the edit field;
    // the publish field's "conversation" entry is a pre-existing grant.
    // Compensation (remove "conversation", keep "spoken") must strip it
    // from the recorded edit field ONLY — a per-user sweep would pass
    // the partner-guard on publish too and delete the legitimate grant.
    const key = await seed("mixed@acme.com", "acme", {
      mode_edit_rights: ["conversation", "spoken"],
      mode_publish_rights: ["conversation", "spoken"],
    });

    await contractOrgModeRights(
      env,
      [{ key, fields: ["mode_edit_rights"] }],
      "conversation",
      "spoken"
    );

    const after = await read("mixed@acme.com");
    expect(after.mode_edit_rights).toEqual(["spoken"]);
    expect(after.mode_publish_rights).toEqual(["conversation", "spoken"]);
  });

  it("leaves a user alone when the partner slug is missing", async () => {
    // Defensive: if state drifted between phases (concurrent admin
    // edit removed the new slug), contract must not strip the old one.
    const key = await seed("drift@acme.com", "acme", {
      mode_edit_rights: ["spoken"],
    });
    await contractOrgModeRights(
      env,
      [{ key, fields: ["mode_edit_rights"] }],
      "spoken",
      "conversation"
    );
    expect((await read("drift@acme.com")).mode_edit_rights).toEqual(["spoken"]);
  });

  it("tolerates keys whose records vanished", async () => {
    await expect(
      contractOrgModeRights(
        env,
        [{ key: "user:gone@acme.com", fields: ["mode_edit_rights"] }],
        "a",
        "b"
      )
    ).resolves.toBeUndefined();
  });
});
