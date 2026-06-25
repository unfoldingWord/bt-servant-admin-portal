import { describe, expect, it } from "vitest";

import {
  filterAuthorizedLanguages,
  filterByAnyRights,
  hasAdminPowers,
  hasAnyLanguageAccess,
  hasAnyLanguageRights,
  hasAnyModeAccess,
  hasLanguageRights,
} from "../src/lib/permissions";

// Trinary back-compat is load-bearing for this file:
//   undefined → full access (predates language_rights)
//   "*"       → full access (explicit)
//   string[]  → explicit allowlist
// All three branches are exercised so a refactor that collapses them
// (e.g. tightening `undefined` to "no access") fails loudly here.

describe("hasLanguageRights", () => {
  it("undefined → true (back-compat for users predating language_rights)", () => {
    expect(hasLanguageRights(undefined, "en")).toBe(true);
    expect(hasLanguageRights(undefined, "anything")).toBe(true);
  });

  it("'*' → true for any name", () => {
    expect(hasLanguageRights("*", "en")).toBe(true);
    expect(hasLanguageRights("*", "fr")).toBe(true);
    expect(hasLanguageRights("*", "")).toBe(true);
  });

  it("array containing the name → true", () => {
    expect(hasLanguageRights(["en", "fr"], "en")).toBe(true);
    expect(hasLanguageRights(["en", "fr"], "fr")).toBe(true);
  });

  it("array missing the name → false", () => {
    expect(hasLanguageRights(["en", "fr"], "es")).toBe(false);
  });

  it("empty array → false (explicit deny-all)", () => {
    expect(hasLanguageRights([], "en")).toBe(false);
    expect(hasLanguageRights([], "anything")).toBe(false);
  });

  it("is case-sensitive on the name comparison", () => {
    // The engine names are slugs (lowercase), so this is a contract check —
    // we don't want a silent case-insensitive comparison sneaking in.
    expect(hasLanguageRights(["en"], "EN")).toBe(false);
  });
});

describe("hasAnyLanguageRights", () => {
  it("undefined → true (back-compat)", () => {
    expect(hasAnyLanguageRights(undefined)).toBe(true);
  });

  it("'*' → true", () => {
    expect(hasAnyLanguageRights("*")).toBe(true);
  });

  it("non-empty array → true", () => {
    expect(hasAnyLanguageRights(["en"])).toBe(true);
    expect(hasAnyLanguageRights(["en", "fr"])).toBe(true);
  });

  it("empty array → false (explicit deny-all)", () => {
    expect(hasAnyLanguageRights([])).toBe(false);
  });
});

describe("hasAdminPowers", () => {
  // "super trumps isAdmin" mirror. Pin every (isAdmin, isSuperAdmin) cell
  // and the null cases so the next person touching the helper can see the
  // truth table at a glance.

  it("null user → false", () => {
    expect(hasAdminPowers(null)).toBe(false);
  });

  it("undefined user → false", () => {
    expect(hasAdminPowers(undefined)).toBe(false);
  });

  it("isAdmin=true, no isSuperAdmin → true (existing org-admin path)", () => {
    expect(hasAdminPowers({ isAdmin: true })).toBe(true);
  });

  it("isAdmin=false, isSuperAdmin=true → true (super trumps)", () => {
    expect(hasAdminPowers({ isAdmin: false, isSuperAdmin: true })).toBe(true);
  });

  it("isAdmin=true, isSuperAdmin=true → true (both set)", () => {
    expect(hasAdminPowers({ isAdmin: true, isSuperAdmin: true })).toBe(true);
  });

  it("isAdmin=false, isSuperAdmin=false → false", () => {
    expect(hasAdminPowers({ isAdmin: false, isSuperAdmin: false })).toBe(false);
  });

  it("both flags undefined → false (neither set ≠ admin)", () => {
    expect(hasAdminPowers({})).toBe(false);
  });
});

describe("filterAuthorizedLanguages", () => {
  const all = [
    { name: "en", label: "English" },
    { name: "fr", label: "French" },
    { name: "es", label: "Spanish" },
  ];

  it("undefined → returns input unchanged", () => {
    expect(filterAuthorizedLanguages(all, undefined)).toEqual(all);
  });

  it("'*' → returns input unchanged", () => {
    expect(filterAuthorizedLanguages(all, "*")).toEqual(all);
  });

  it("array → filters to the allowed names", () => {
    expect(filterAuthorizedLanguages(all, ["en", "es"])).toEqual([
      { name: "en", label: "English" },
      { name: "es", label: "Spanish" },
    ]);
  });

  it("preserves input order under array form", () => {
    // Output order follows the input array's order, not the rights' order —
    // important so the dropdown stays alphabetized regardless of how the
    // rights array was constructed.
    const out = filterAuthorizedLanguages(all, ["es", "en"]);
    expect(out.map((l) => l.name)).toEqual(["en", "es"]);
  });

  it("empty rights → empty output", () => {
    expect(filterAuthorizedLanguages(all, [])).toEqual([]);
  });

  it("rights with unknown names → just drops the unknowns", () => {
    expect(filterAuthorizedLanguages(all, ["en", "klingon"])).toEqual([
      { name: "en", label: "English" },
    ]);
  });

  it("preserves the full input object shape (generic over T)", () => {
    const richer = [
      { name: "en", label: "English", published: true, document: "..." },
      { name: "fr", label: "French", published: false, document: "..." },
    ];
    const out = filterAuthorizedLanguages(richer, ["en"]);
    expect(out).toEqual([
      { name: "en", label: "English", published: true, document: "..." },
    ]);
  });
});

// #181 verb-perms — union helpers for page-level / sidebar gates that
// don't care about the verb axis, just "can the user touch this surface
// at all?" Combines edit and publish rights into a single yes/no.

describe("hasAnyLanguageAccess", () => {
  it("null user → false", () => {
    expect(hasAnyLanguageAccess(null)).toBe(false);
    expect(hasAnyLanguageAccess(undefined)).toBe(false);
  });

  it("user with edit-only access → true", () => {
    expect(
      hasAnyLanguageAccess({
        language_edit_rights: ["en"],
        language_publish_rights: [],
      })
    ).toBe(true);
  });

  it("user with publish-only access → true", () => {
    expect(
      hasAnyLanguageAccess({
        language_edit_rights: [],
        language_publish_rights: ["en"],
      })
    ).toBe(true);
  });

  it("user with both empty → false", () => {
    expect(
      hasAnyLanguageAccess({
        language_edit_rights: [],
        language_publish_rights: [],
      })
    ).toBe(false);
  });

  it("user with no fields set (legacy) → true (back-compat full access)", () => {
    expect(hasAnyLanguageAccess({})).toBe(true);
  });

  it("user with '*' on either field → true", () => {
    expect(
      hasAnyLanguageAccess({
        language_edit_rights: "*",
        language_publish_rights: [],
      })
    ).toBe(true);
  });

  it("[review F4] legacy language_rights falls back when verb-perms unset", () => {
    // Pre-#181 sessions only carry `language_rights`; the union helper
    // must mirror the worker's lazy-fallback chain so legacy shepherds
    // see the sidebar entry until they're re-saved through the new
    // dialog.
    expect(hasAnyLanguageAccess({ language_rights: ["en"] })).toBe(true);
    expect(hasAnyLanguageAccess({ language_rights: "*" })).toBe(true);
    expect(hasAnyLanguageAccess({ language_rights: [] })).toBe(false);
  });
});

describe("hasAnyModeAccess", () => {
  it("null user → false", () => {
    expect(hasAnyModeAccess(null)).toBe(false);
  });

  it("user with mode_edit_rights set → true", () => {
    expect(hasAnyModeAccess({ mode_edit_rights: ["spoken"] })).toBe(true);
  });

  it("user with both empty → false", () => {
    expect(
      hasAnyModeAccess({
        mode_edit_rights: [],
        mode_publish_rights: [],
      })
    ).toBe(false);
  });

  it("[review F12] both undefined → false (modes have no pre-#181 legacy access)", () => {
    // Unlike languages, modes had no per-row rights pre-#181 — the
    // gate was admin-only. A non-admin with `mode_edit_rights ===
    // undefined && mode_publish_rights === undefined` had zero mode
    // access, and the union helper must match the worker's mode-
    // baseline gate rather than the language back-compat rule.
    expect(hasAnyModeAccess({})).toBe(false);
    expect(
      hasAnyModeAccess({
        mode_edit_rights: undefined,
        mode_publish_rights: undefined,
      })
    ).toBe(false);
  });
});

describe("filterByAnyRights", () => {
  const all = [
    { name: "en", label: "English" },
    { name: "fr", label: "French" },
    { name: "es", label: "Spanish" },
  ];

  it("union of edit and publish names", () => {
    expect(filterByAnyRights(all, ["en"], ["es"])).toEqual([
      { name: "en", label: "English" },
      { name: "es", label: "Spanish" },
    ]);
  });

  it("undefined on either side → returns input unchanged", () => {
    expect(filterByAnyRights(all, undefined, [])).toEqual(all);
    expect(filterByAnyRights(all, [], undefined)).toEqual(all);
  });

  it("'*' on either side → returns input unchanged", () => {
    expect(filterByAnyRights(all, "*", [])).toEqual(all);
    expect(filterByAnyRights(all, [], "*")).toEqual(all);
  });

  it("both empty arrays → empty", () => {
    expect(filterByAnyRights(all, [], [])).toEqual([]);
  });
});
