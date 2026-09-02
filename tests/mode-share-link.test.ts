import { describe, expect, it } from "vitest";

import {
  buildModeShareFilename,
  buildModeShareLink,
  isModeShareOpen,
  modeShareState,
  modeShareTrigger,
  normalizeWhatsAppNumber,
  resolveModeSharePanelState,
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
      "a/b",
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

  it("never lets a hostile slug reach the URL unencoded", () => {
    const result = buildModeShareLink("15550100100", "fia&text=evil");
    expect(result.ok).toBe(false);
  });
});

describe("modeShareTrigger", () => {
  it("is the worker's leading-token form", () => {
    expect(modeShareTrigger("fia-mode")).toBe("#fia-mode");
  });
});

describe("modeShareState", () => {
  const ready = { published: true, requires_group: false };

  it("is ready for a published, non-group mode in the gateway's org", () => {
    expect(modeShareState(ready, "unfoldingWord", "unfoldingWord")).toBe(
      "ready"
    );
  });

  it("treats absent flags as their false defaults", () => {
    expect(modeShareState({}, "acme", "acme")).toBe("draft");
    expect(modeShareState({ published: true }, "acme", "acme")).toBe("ready");
  });

  it("reports the hardest constraint first: org, then group-only, then draft", () => {
    const groupOnlyPublished = { published: true, requires_group: true };
    // Org beats everything, including a published group-only mode.
    expect(modeShareState({}, "acme", "unfoldingWord")).toBe("org-mismatch");
    expect(modeShareState(groupOnlyPublished, "acme", "unfoldingWord")).toBe(
      "org-mismatch"
    );
    // Group-only beats draft, and applies to published modes too.
    expect(
      modeShareState({ published: false, requires_group: true }, "acme", "acme")
    ).toBe("group-only");
    expect(modeShareState(groupOnlyPublished, "acme", "acme")).toBe(
      "group-only"
    );
    expect(modeShareState({ published: false }, "acme", "acme")).toBe("draft");
  });

  it("does not block on an unknown org on either side", () => {
    expect(modeShareState(ready, null, "unfoldingWord")).toBe("ready");
    expect(modeShareState(ready, "acme", null)).toBe("ready");
    expect(modeShareState(ready, undefined, undefined)).toBe("ready");
  });

  it("compares orgs exactly (case-sensitive, like the worker's KV key) but trimmed", () => {
    expect(modeShareState(ready, "unfoldingword", "unfoldingWord")).toBe(
      "org-mismatch"
    );
    // Legacy stored orgs can carry whitespace padding (#247/#253).
    expect(modeShareState(ready, " unfoldingWord", "unfoldingWord")).toBe(
      "ready"
    );
    expect(modeShareState(ready, "acme", "   ")).toBe("ready");
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

  it("follows the query lifecycle before anything else", () => {
    expect(
      resolveModeSharePanelState(
        { ...loaded, pending: true },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "loading" });
    expect(
      resolveModeSharePanelState(
        { ...loaded, error: true },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "error" });
  });

  it("is ready with the built link when everything lines up", () => {
    expect(resolveModeSharePanelState(loaded, ready, "acme", "fia")).toEqual({
      kind: "ready",
      url: "https://wa.me/573001234567?text=%23fia",
      orgUnverified: false,
    });
  });

  it("flags a ready result whose org check was skipped", () => {
    expect(
      resolveModeSharePanelState(
        { ...loaded, whatsappOrg: null },
        ready,
        "acme",
        "fia"
      )
    ).toMatchObject({ kind: "ready", orgUnverified: true });
  });

  it("puts eligibility ahead of the number", () => {
    const noNumber = { ...loaded, whatsappNumber: null };
    expect(resolveModeSharePanelState(noNumber, {}, "acme", "fia")).toEqual({
      kind: "draft",
    });
    expect(
      resolveModeSharePanelState(
        noNumber,
        { requires_group: true },
        "acme",
        "fia"
      )
    ).toEqual({ kind: "group-only" });
    expect(resolveModeSharePanelState(noNumber, ready, "other", "fia")).toEqual(
      { kind: "org-mismatch", whatsappOrg: "acme" }
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
    ).toEqual({ kind: "unconfigured" });
    expect(
      resolveModeSharePanelState(
        { ...loaded, whatsappNumber: "nope" },
        ready,
        "acme",
        "fia"
      )
    ).toEqual({ kind: "number-invalid" });
    // A non-canonical name is the author's to fix, not an env problem.
    expect(
      resolveModeSharePanelState(loaded, ready, "acme", "Fia Mode")
    ).toEqual({ kind: "slug-invalid" });
    expect(
      resolveModeSharePanelState(loaded, ready, "acme", "default")
    ).toEqual({ kind: "slug-reserved" });
  });

  it("treats an absent BFF route as not configured, not as an error", () => {
    const unsupported: ShareConfigSnapshot = {
      pending: false,
      error: false,
      supported: false,
      whatsappNumber: null,
      whatsappOrg: null,
    };
    expect(
      resolveModeSharePanelState(unsupported, ready, "acme", "fia")
    ).toEqual({ kind: "unconfigured" });
    // ...and it cannot block on an org it does not know.
    expect(resolveModeSharePanelState(unsupported, {}, "acme", "fia")).toEqual({
      kind: "draft",
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
