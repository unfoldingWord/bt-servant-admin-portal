import { describe, expect, it } from "vitest";

import { canBootstrapLanguage } from "../src/lib/language-bootstrap-gate";

// #247 mirrors the Languages page `canCreate` gate — these cases lock in
// the parity so a refactor to either side has to touch both together.

describe("canBootstrapLanguage", () => {
  const org = "acme";

  it("null / undefined caller → false", () => {
    expect(
      canBootstrapLanguage({
        caller: null,
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(false);
    expect(
      canBootstrapLanguage({
        caller: undefined,
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(false);
  });

  it("home-org caller with legacy undefined rights → true (back-compat)", () => {
    // Predates verb-perms; language_rights === undefined → full access.
    expect(
      canBootstrapLanguage({
        caller: {},
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(true);
  });

  it("home-org caller with explicit language_edit_rights → true", () => {
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: ["spanish"] },
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(true);
  });

  it("home-org caller with language_edit_rights: '*' → true", () => {
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: "*" },
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(true);
  });

  it("home-org caller with empty language_edit_rights → false", () => {
    // Elsy's reproduction: new user created with [] can't bootstrap.
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: [] },
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(false);
  });

  it("home-org caller with only publish-rights set → false", () => {
    // Partner-aware rule: setting publish but not edit is a deliberate
    // gap, NOT legacy full access. Bootstrap needs edit, not publish.
    expect(
      canBootstrapLanguage({
        caller: { language_publish_rights: ["spanish"] },
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(false);
  });

  it("home-org caller with legacy `language_rights` fallback → true", () => {
    // Both verb-perms unset, legacy field grants full → falls through.
    expect(
      canBootstrapLanguage({
        caller: { language_rights: "*" },
        callerOrg: org,
        callerIsSuperAdmin: false,
        targetOrg: org,
      })
    ).toBe(true);
  });

  it("cross-org super-admin → true regardless of per-row rights", () => {
    // Worker's PR A carve-out: super-admins bypass per-row rights when
    // editing a different org.
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: [] },
        callerOrg: "home",
        callerIsSuperAdmin: true,
        targetOrg: "other",
      })
    ).toBe(true);
  });

  it("same-org super-admin without edit rights → false", () => {
    // Same-org super-admins fall through to per-row check — the
    // cross-org carve-out doesn't fire when target === home org.
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: [] },
        callerOrg: org,
        callerIsSuperAdmin: true,
        targetOrg: org,
      })
    ).toBe(false);
  });

  it("super-admin with null targetOrg → falls through to per-row", () => {
    // If the Org input is blank the dialog can't fetch; the gate should
    // treat it as "not cross-org" rather than granting bootstrap by
    // default.
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: [] },
        callerOrg: org,
        callerIsSuperAdmin: true,
        targetOrg: null,
      })
    ).toBe(false);
    expect(
      canBootstrapLanguage({
        caller: { language_edit_rights: "*" },
        callerOrg: org,
        callerIsSuperAdmin: true,
        targetOrg: null,
      })
    ).toBe(true);
  });
});
