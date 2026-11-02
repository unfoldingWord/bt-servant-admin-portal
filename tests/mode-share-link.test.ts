import { describe, expect, it } from "vitest";

import {
  buildModeShareFilename,
  buildModeShareLink,
  isModeShareOpen,
  isQualifiedModeName,
  modeShareState,
  modeShareTrigger,
  normalizeWhatsAppNumber,
  orgSlug,
  resolveModeSharePanelState,
  resolveModeShareTarget,
  validateModeShareSlug,
  type ShareConfigSnapshot,
} from "../src/lib/mode-share-link";

// #311 — the wa.me deep link the per-mode QR encodes. Number and slug are
// both treated as untrusted input; these pin the shape checks and the exact
// URL text, since a QR is only as good as the bytes it carries.

describe("normalizeWhatsAppNumber", () => {
  it("strips the + and the punctuation people paste from a contact card", () => {
    expect(normalizeWhatsAppNumber("+57 300 123 4567")).toBe("573001234567");
    expect(normalizeWhatsAppNumber("+1 (555) 010-0100")).toBe("15550100100");
    expect(normalizeWhatsAppNumber("  +44.7700.900123  ")).toBe("447700900123");
    expect(normalizeWhatsAppNumber("573001234567")).toBe("573001234567");
  });

  it("rejects anything that is not a plausible E.164 number", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
    expect(normalizeWhatsAppNumber("   ")).toBeNull();
    // Leading zero is not E.164 (that is a national trunk prefix).
    expect(normalizeWhatsAppNumber("0573001234567")).toBeNull();
    // Too short / too long.
    expect(normalizeWhatsAppNumber("+12345")).toBeNull();
    expect(normalizeWhatsAppNumber("+1234567890123456")).toBeNull();
    // Letters, a second +, or URL fragments never pass.
    expect(normalizeWhatsAppNumber("+57 300 ABC 4567")).toBeNull();
    expect(normalizeWhatsAppNumber("++573001234567")).toBeNull();
    expect(normalizeWhatsAppNumber("573001234567?text=hi")).toBeNull();
    expect(normalizeWhatsAppNumber("573001234567/../x")).toBeNull();
    expect(normalizeWhatsAppNumber("15550100100&text=x")).toBeNull();
    expect(normalizeWhatsAppNumber("15550100100@evil")).toBeNull();
    expect(normalizeWhatsAppNumber("https://wa.me/15550100100")).toBeNull();
    expect(normalizeWhatsAppNumber("+")).toBeNull();
  });

  it("tolerates whitespace, including a pasted CR/LF, but only digits ever survive", () => {
    // Whitespace is stripped like any other contact-card separator; what
    // matters for the URL is that the output alphabet is digits only.
    for (const raw of [
      "15550100100\r\n",
      "1555\n0100100",
      "\t+1 555 010 0100 ",
    ]) {
      const out = normalizeWhatsAppNumber(raw);
      expect(out).toBe("15550100100");
      expect(out).toMatch(/^[0-9]+$/);
    }
  });
});

describe("buildModeShareLink", () => {
  it("builds the wa.me link with the #slug trigger percent-encoded", () => {
    const result = buildModeShareLink(
      "+57 300 123 4567",
      "sbc-translation-coach"
    );
    expect(result).toEqual({
      ok: true,
      url: "https://wa.me/573001234567?text=%23sbc-translation-coach",
      digits: "573001234567",
      trigger: "#sbc-translation-coach",
    });
  });

  it("keeps digits and hyphens in the slug legible", () => {
    const result = buildModeShareLink("15550100100", "kids-mode2");
    expect(result.ok && result.url).toBe(
      "https://wa.me/15550100100?text=%23kids-mode2"
    );
    const single = buildModeShareLink("15550100100", "x");
    expect(single.ok && single.url).toBe("https://wa.me/15550100100?text=%23x");
  });

  it("distinguishes a missing number from an invalid one", () => {
    expect(buildModeShareLink(null, "fia-mode")).toEqual({
      ok: false,
      reason: "number-missing",
    });
    expect(buildModeShareLink("", "fia-mode")).toEqual({
      ok: false,
      reason: "number-missing",
    });
    expect(buildModeShareLink("   ", "fia-mode")).toEqual({
      ok: false,
      reason: "number-missing",
    });
    expect(buildModeShareLink("not a number", "fia-mode")).toEqual({
      ok: false,
      reason: "number-invalid",
    });
  });

  it("refuses a slug the worker's MODE_NAME_PATTERN would reject instead of rewriting it", () => {
    // A rewritten slug would encode a trigger for a DIFFERENT mode. The
    // worker pattern has no underscore (the portal's slugify keeps it) and
    // caps at 64 chars.
    const tooLong = "a".repeat(65);
    for (const bad of [
      "",
      "Fia Mode",
      "fia mode",
      "fia-mode?x=1",
      "-fia-",
      "fia-",
      "#fia",
      "kids_mode2",
      tooLong,
    ]) {
      expect(buildModeShareLink("15550100100", bad), bad).toEqual({
        ok: false,
        reason: "slug-invalid",
      });
    }
    expect(buildModeShareLink("15550100100", "a".repeat(64)).ok).toBe(true);
  });

  it("holds a stored slug with `/` to the bare rule before any qualifying", () => {
    // `/` is never part of a stored mode name; the panel checks the stored
    // slug first, so a qualified-looking name can't slip through as one.
    expect(validateModeShareSlug("a/b")).toBe("slug-invalid");
    expect(
      resolveModeSharePanelState(
        {
          pending: false,
          error: false,
          supported: true,
          whatsappNumber: "15550100100",
          whatsappOrg: "unfoldingWord",
        },
        { published: true },
        "PBT",
        "pbt/obt-coach"
      )
    ).toEqual({ kind: "slug-invalid", trigger: null, partnerOrg: null });
  });

  it("refuses the worker's reserved clear-mode tokens", () => {
    // `#default` / `#none` / `#clear` deactivate the current mode in the
    // classifier before any mode matching runs.
    for (const reserved of ["default", "none", "clear"]) {
      expect(buildModeShareLink("15550100100", reserved)).toEqual({
        ok: false,
        reason: "slug-reserved",
      });
    }
    expect(buildModeShareLink("15550100100", "default-mode").ok).toBe(true);
  });

  it("builds the qualified #<orgslug>/<slug> link the worker's welcome link emits", () => {
    // Same bytes as bt-servant-worker tests/unit/mode-share-link.test.ts:
    // buildModeShareLink('15558196461', 'pbt/obt-coach').
    expect(buildModeShareLink("15558196461", "pbt/obt-coach")).toEqual({
      ok: true,
      url: "https://wa.me/15558196461?text=%23pbt%2Fobt-coach",
      digits: "15558196461",
      trigger: "#pbt/obt-coach",
    });
  });

  it("refuses a malformed qualified name instead of emitting it", () => {
    for (const bad of [
      "/fia",
      "pbt/",
      "PBT/fia",
      "-pbt/fia",
      "a/b/c",
      `${"a".repeat(65)}/fia`,
      "pbt/kids_mode",
    ]) {
      expect(buildModeShareLink("15550100100", bad), bad).toEqual({
        ok: false,
        reason: "slug-invalid",
      });
    }
  });

  it("does not treat a qualified name ending in a clear token as reserved", () => {
    // The worker checks the WHOLE token against CLEAR_TOKENS, so
    // `#pbt/default` would select a mode, not clear one.
    expect(buildModeShareLink("15550100100", "pbt/default").ok).toBe(true);
  });

  it("never lets a hostile slug reach the URL unencoded", () => {
    const result = buildModeShareLink("15550100100", "fia&text=evil");
    expect(result.ok).toBe(false);
  });
});

describe("modeShareTrigger", () => {
  it("is the worker's leading-token form", () => {
    expect(modeShareTrigger("fia-mode")).toBe("#fia-mode");
    expect(modeShareTrigger("pbt/obt-coach")).toBe("#pbt/obt-coach");
  });
});

describe("modeShareState", () => {
  it("is ready for a published, non-group mode", () => {
    expect(modeShareState({ published: true, requires_group: false })).toBe(
      "ready"
    );
  });

  it("treats absent flags as their false defaults", () => {
    expect(modeShareState({})).toBe("draft");
    expect(modeShareState({ published: true })).toBe("ready");
  });

  it("reports group-only ahead of draft, and for published modes too", () => {
    expect(modeShareState({ published: false, requires_group: true })).toBe(
      "group-only"
    );
    expect(modeShareState({ published: true, requires_group: true })).toBe(
      "group-only"
    );
    expect(modeShareState({ published: false })).toBe("draft");
  });
});

// #345 — the worker's org slug rule (bt-servant-worker
// src/utils/cross-org-modes.ts `orgSlug`). These are the worker's own test
// cases (tests/unit/cross-org-modes.test.ts); if the worker rule changes,
// this block must change with it or the portal's partner links break.
describe("orgSlug (parity with the worker)", () => {
  it("lowercases and hyphenates like the worker", () => {
    expect(orgSlug("Test Organization")).toBe("test-organization");
    expect(orgSlug("Bible Society of Jordan")).toBe("bible-society-of-jordan");
    expect(orgSlug("PBT")).toBe("pbt");
    expect(orgSlug("unfoldingWord")).toBe("unfoldingword");
  });

  it("collapses every run outside [a-z0-9] to one hyphen", () => {
    expect(orgSlug("a/b")).toBe("a-b");
    expect(orgSlug("Foo  &  Bar")).toBe("foo-bar");
    expect(orgSlug("x__y..z")).toBe("x-y-z");
  });

  it("trims and strips edge hyphens", () => {
    expect(orgSlug("  Haneen ")).toBe("haneen");
    expect(orgSlug("-Org-")).toBe("org");
    expect(orgSlug("(Org)")).toBe("org");
  });

  it("is empty for a blank or punctuation-only name", () => {
    expect(orgSlug("***")).toBe("");
    expect(orgSlug("   ")).toBe("");
    expect(orgSlug("")).toBe("");
  });

  it("is idempotent", () => {
    expect(orgSlug(orgSlug("Test Organization"))).toBe("test-organization");
    expect(orgSlug("Haneen")).toBe(orgSlug("haneen"));
  });
});

describe("isQualifiedModeName", () => {
  it("accepts <org-slug>/<mode-slug> with both halves on the worker pattern", () => {
    expect(isQualifiedModeName("pbt/obt-coach")).toBe(true);
    expect(isQualifiedModeName(`${"a".repeat(64)}/${"b".repeat(64)}`)).toBe(
      true
    );
  });

  it("rejects anything the worker's validateModeSelection would", () => {
    for (const bad of [
      "obt-coach",
      "/obt-coach",
      "pbt/",
      "a/b/c",
      "PBT/obt-coach",
      "-pbt/obt-coach",
      `${"a".repeat(65)}/x`,
      "pbt/kids_mode",
    ]) {
      expect(isQualifiedModeName(bad), bad).toBe(false);
    }
  });
});

describe("resolveModeShareTarget", () => {
  it("keeps the bare slug for a mode in the gateway's org", () => {
    expect(
      resolveModeShareTarget("fia", "unfoldingWord", "unfoldingWord")
    ).toEqual({ kind: "home", name: "fia" });
  });

  it("qualifies a partner org's mode with the worker's org slug", () => {
    expect(resolveModeShareTarget("obt-coach", "PBT", "unfoldingWord")).toEqual(
      { kind: "partner", name: "pbt/obt-coach", org: "PBT" }
    );
    expect(
      resolveModeShareTarget("kids-vbs", "Test Organization", "unfoldingWord")
    ).toEqual({
      kind: "partner",
      name: "test-organization/kids-vbs",
      org: "Test Organization",
    });
  });

  it("compares orgs exactly, like the worker's `name !== homeKey`", () => {
    // A case variant is a different KV key, so a foreign org to the worker.
    expect(
      resolveModeShareTarget("fia", "unfoldingword", "unfoldingWord")
    ).toEqual({
      kind: "partner",
      name: "unfoldingword/fia",
      org: "unfoldingword",
    });
    // So is a legacy padded org (#247/#253): its modes live under
    // " unfoldingWord:modes", which the worker's chat path reads as foreign.
    // orgSlug trims, so the qualifier is unaffected.
    expect(
      resolveModeShareTarget("fia", " unfoldingWord", "unfoldingWord")
    ).toEqual({
      kind: "partner",
      name: "unfoldingword/fia",
      org: "unfoldingWord",
    });
  });

  it("refuses an org whose slug is empty or too long, never emitting #/<slug>", () => {
    expect(resolveModeShareTarget("fia", "***", "unfoldingWord")).toEqual({
      kind: "org-unencodable",
      org: "***",
    });
    expect(
      resolveModeShareTarget("fia", "a".repeat(65), "unfoldingWord")
    ).toEqual({ kind: "org-unencodable", org: "a".repeat(65) });
  });

  it("judges only the org half: a bad mode slug is not an org problem", () => {
    expect(
      resolveModeShareTarget("Fia Mode", "PBT", "unfoldingWord")
    ).toMatchObject({ kind: "partner" });
  });

  it("decides nothing when either org is unknown, rather than guessing home", () => {
    expect(resolveModeShareTarget("fia", "acme", null)).toEqual({
      kind: "org-unknown",
      missing: "gateway",
    });
    expect(resolveModeShareTarget("fia", "acme", "   ")).toEqual({
      kind: "org-unknown",
      missing: "gateway",
    });
    expect(resolveModeShareTarget("fia", null, "unfoldingWord")).toEqual({
      kind: "org-unknown",
      missing: "mode",
    });
    expect(resolveModeShareTarget("fia", undefined, undefined)).toEqual({
      kind: "org-unknown",
      missing: "gateway",
    });
  });
});

describe("buildModeShareFilename", () => {
  it("names the file by org, slug, and format", () => {
    expect(buildModeShareFilename("unfoldingWord", "fia-mode", "svg")).toBe(
      "unfoldingWord-mode-fia-mode-whatsapp-qr.svg"
    );
    expect(buildModeShareFilename("acme co/ltd", "x", "png")).toBe(
      "acme_co_ltd-mode-x-whatsapp-qr.png"
    );
  });

  it("never yields a dot-file or traversal-shaped name", () => {
    expect(buildModeShareFilename("", "x", "svg")).toBe(
      "untitled-mode-x-whatsapp-qr.svg"
    );
    expect(buildModeShareFilename("..", "x", "svg")).toBe(
      "untitled-mode-x-whatsapp-qr.svg"
    );
    expect(buildModeShareFilename(".hidden", "x", "svg")).toBe(
      "hidden-mode-x-whatsapp-qr.svg"
    );
  });
});

describe("resolveModeSharePanelState", () => {
  const loaded: ShareConfigSnapshot = {
    pending: false,
    error: false,
    supported: true,
    whatsappNumber: "+57 300 123 4567",
    whatsappOrg: "acme",
  };
  const ready = { published: true, requires_group: false };
  const none = { trigger: null, partnerOrg: null };
  const home = (slug: string) => ({ trigger: `#${slug}`, partnerOrg: null });

  it("follows the query lifecycle before anything else, showing no trigger", () => {
    expect(
      resolveModeSharePanelState(
        { ...loaded, pending: true },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "loading", ...none });
    expect(
      resolveModeSharePanelState(
        { ...loaded, error: true },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "error", ...none });
  });

  it("is ready with the built link when everything lines up", () => {
    expect(resolveModeSharePanelState(loaded, ready, "acme", "fia")).toEqual({
      kind: "ready",
      url: "https://wa.me/573001234567?text=%23fia",
      ...home("fia"),
    });
  });

  it("gives a published partner-org mode the qualified link, never a bare one", () => {
    expect(
      resolveModeSharePanelState(loaded, ready, "PBT", "obt-coach")
    ).toEqual({
      kind: "ready",
      url: "https://wa.me/573001234567?text=%23pbt%2Fobt-coach",
      trigger: "#pbt/obt-coach",
      partnerOrg: "PBT",
    });
  });

  it("keeps the draft and group-only refusals for a partner mode, with its qualified trigger", () => {
    const partner = { trigger: "#pbt/obt-coach", partnerOrg: "PBT" };
    expect(resolveModeSharePanelState(loaded, {}, "PBT", "obt-coach")).toEqual({
      kind: "draft",
      ...partner,
    });
    expect(
      resolveModeSharePanelState(
        loaded,
        { published: true, requires_group: true },
        "PBT",
        "obt-coach"
      )
    ).toEqual({ kind: "group-only", ...partner });
  });

  it("refuses a partner org whose name can't be slugged, ahead of publish advice", () => {
    for (const flags of [ready, {}]) {
      expect(resolveModeSharePanelState(loaded, flags, "***", "fia")).toEqual({
        kind: "org-unencodable",
        org: "***",
        ...none,
      });
    }
  });

  it("never falls back to a bare link when the gateway org is unknown", () => {
    // Since worker#437 a bare #fia means the GATEWAY org's mode; with the
    // gateway org unknown the panel can't know whether that is this mode.
    expect(
      resolveModeSharePanelState(
        { ...loaded, whatsappOrg: null },
        ready,
        "PBT",
        "fia"
      )
    ).toEqual({ kind: "org-unknown", missing: "gateway", ...none });
    expect(resolveModeSharePanelState(loaded, ready, null, "fia")).toEqual({
      kind: "org-unknown",
      missing: "mode",
      ...none,
    });
  });

  it("puts eligibility ahead of the number", () => {
    const noNumber = { ...loaded, whatsappNumber: null };
    expect(resolveModeSharePanelState(noNumber, {}, "acme", "fia")).toEqual({
      kind: "draft",
      ...home("fia"),
    });
    expect(
      resolveModeSharePanelState(
        noNumber,
        { requires_group: true },
        "acme",
        "fia"
      )
    ).toEqual({ kind: "group-only", ...home("fia") });
    // A ready partner mode with no number is an env problem, as at home.
    expect(resolveModeSharePanelState(noNumber, ready, "other", "fia")).toEqual(
      { kind: "unconfigured", trigger: "#other/fia", partnerOrg: "other" }
    );
  });

  it("names each link failure distinctly", () => {
    expect(
      resolveModeSharePanelState(
        { ...loaded, whatsappNumber: null },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "unconfigured", ...home("fia") });
    expect(
      resolveModeSharePanelState(
        { ...loaded, whatsappNumber: "nope" },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "number-invalid", ...home("fia") });
    // A non-canonical name is the author's to fix, not an env problem.
    expect(
      resolveModeSharePanelState(loaded, ready, "acme", "Fia Mode")
    ).toEqual({ kind: "slug-invalid", ...none });
    expect(
      resolveModeSharePanelState(loaded, ready, "acme", "default")
    ).toEqual({ kind: "slug-reserved", ...home("default") });
  });

  it("keeps the reserved-name refusal for a partner mode, with its real trigger", () => {
    // `#pbt/default` is not a clear token to the worker; the refusal is
    // portal policy, and the copy says so from the qualified trigger.
    expect(resolveModeSharePanelState(loaded, ready, "PBT", "default")).toEqual(
      { kind: "slug-reserved", trigger: "#pbt/default", partnerOrg: "PBT" }
    );
  });

  it("names an identity problem before any publish advice", () => {
    // A draft named `default` should hear "rename", not "publish": publishing
    // would not make the QR work, and the reserved token is the real block.
    expect(resolveModeSharePanelState(loaded, {}, "acme", "default")).toEqual({
      kind: "slug-reserved",
      ...home("default"),
    });
    expect(resolveModeSharePanelState(loaded, {}, "other", "Fia Mode")).toEqual(
      { kind: "slug-invalid", ...none }
    );
    // ...but never ahead of the query lifecycle.
    expect(
      resolveModeSharePanelState(
        { ...loaded, pending: true },
        {},
        "acme",
        "default"
      )
    ).toEqual({ kind: "loading", ...none });
  });

  it("treats an absent BFF route as not configured, whatever the flags", () => {
    const unsupported: ShareConfigSnapshot = {
      pending: false,
      error: false,
      supported: false,
      whatsappNumber: null,
      whatsappOrg: null,
    };
    expect(
      resolveModeSharePanelState(unsupported, ready, "acme", "fia")
    ).toEqual({ kind: "unconfigured", ...none });
    expect(resolveModeSharePanelState(unsupported, {}, "acme", "fia")).toEqual({
      kind: "unconfigured",
      ...none,
    });
  });
});

describe("isModeShareOpen", () => {
  it("is open only while the selection is the mode the button was pressed for", () => {
    expect(isModeShareOpen("fia", "fia")).toBe(true);
    expect(isModeShareOpen(null, "fia")).toBe(false);
    expect(isModeShareOpen(null, null)).toBe(false);
  });

  it("closes in the same render when the selection clears or moves", () => {
    // Stale-mode / rights-drop effects null the selection.
    expect(isModeShareOpen("fia", null)).toBe(false);
    // A → B: never a frame of B's name under A's flags.
    expect(isModeShareOpen("fia", "mast")).toBe(false);
  });
});

describe("validateModeShareSlug", () => {
  it("mirrors the worker's name pattern and reserved tokens", () => {
    expect(validateModeShareSlug("fia-mode")).toBe("ok");
    expect(validateModeShareSlug("kids_mode")).toBe("slug-invalid");
    expect(validateModeShareSlug("")).toBe("slug-invalid");
    for (const r of ["default", "none", "clear"]) {
      expect(validateModeShareSlug(r)).toBe("slug-reserved");
    }
  });
});
