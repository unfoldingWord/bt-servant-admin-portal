import { describe, expect, it } from "vitest";

import {
  buildModeShareFilename,
  isModeShareOpen,
  isUrlSafeShareCode,
  buildShareLinkFromCode,
  modeShareState,
  modeShareTrigger,
  normalizeWhatsAppNumber,
  resolveModeSharePanelState,
  homeOrgWithoutModes,
  refreshFailed,
  retryControl,
  shareCodeDisagreesWithFlags,
  shownTrigger,
  validateModeShareSlug,
  type ModeSharePanelState,
  type ShareCodeSnapshot,
  type ShareConfigSnapshot,
} from "../src/lib/mode-share-link";
import type { ModeShareCode } from "../src/lib/mode-share-code-api";
import type { ModeShareCodeResponse } from "../src/types/mode-share-code";

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

describe("buildShareLinkFromCode — bare codes", () => {
  it("builds the wa.me link with the #slug trigger percent-encoded", () => {
    expect(
      buildShareLinkFromCode("+57 300 123 4567", "sbc-translation-coach")
    ).toEqual({
      ok: true,
      url: "https://wa.me/573001234567?text=%23sbc-translation-coach",
      digits: "573001234567",
      trigger: "#sbc-translation-coach",
    });
  });

  it("keeps digits and hyphens in the code legible", () => {
    const result = buildShareLinkFromCode("15550100100", "kids-mode2");
    expect(result.ok && result.url).toBe(
      "https://wa.me/15550100100?text=%23kids-mode2"
    );
    const single = buildShareLinkFromCode("15550100100", "x");
    expect(single.ok && single.url).toBe("https://wa.me/15550100100?text=%23x");
  });

  it("distinguishes a missing number from an invalid one", () => {
    for (const missing of [null, "", "   "]) {
      expect(buildShareLinkFromCode(missing, "fia-mode")).toEqual({
        ok: false,
        reason: "number-missing",
      });
    }
    expect(buildShareLinkFromCode("not a number", "fia-mode")).toEqual({
      ok: false,
      reason: "number-invalid",
    });
  });

  it("never lets a hostile code reach the URL", () => {
    expect(buildShareLinkFromCode("15550100100", "fia&text=evil")).toEqual({
      ok: false,
      reason: "code-unencodable",
    });
  });
});

describe("validateModeShareSlug — the stored slug", () => {
  it("refuses a slug the worker's MODE_NAME_PATTERN would reject instead of rewriting it", () => {
    // A rewritten slug would encode a trigger for a DIFFERENT mode. The
    // worker pattern has no underscore (the portal's slugify keeps it) and
    // caps at 64 chars.
    for (const bad of [
      "",
      "Fia Mode",
      "fia mode",
      "fia-mode?x=1",
      "-fia-",
      "fia-",
      "#fia",
      "a/b",
      "kids_mode2",
      "a".repeat(65),
    ]) {
      expect(validateModeShareSlug(bad), bad).toBe("slug-invalid");
    }
    expect(validateModeShareSlug("a".repeat(64))).toBe("ok");
  });

  it("refuses the worker's reserved clear-mode tokens", () => {
    // `#default` / `#none` / `#clear` deactivate the current mode in the
    // classifier before any mode matching runs.
    for (const reserved of ["default", "none", "clear"]) {
      expect(validateModeShareSlug(reserved)).toBe("slug-reserved");
    }
    expect(validateModeShareSlug("default-mode")).toBe("ok");
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

  it("reports draft ahead of group-only, as the worker does", () => {
    // bt-servant-worker src/utils/mode-share-code.ts `staticReason`:
    // published is checked before requires_group.
    expect(modeShareState({ published: false, requires_group: true })).toBe(
      "draft"
    );
    expect(modeShareState({ published: true, requires_group: true })).toBe(
      "group-only"
    );
    expect(modeShareState({ published: false })).toBe("draft");
  });
});

describe("buildShareLinkFromCode", () => {
  it("builds the qualified #<orgslug>/<slug> link the worker's welcome link emits", () => {
    // Same bytes as bt-servant-worker tests/unit/mode-share-link.test.ts:
    // buildModeShareLink('15558196461', 'pbt/obt-coach').
    expect(buildShareLinkFromCode("15558196461", "pbt/obt-coach")).toEqual({
      ok: true,
      url: "https://wa.me/15558196461?text=%23pbt%2Fobt-coach",
      digits: "15558196461",
      trigger: "#pbt/obt-coach",
    });
  });

  it("trusts a resolving code beyond the portal's own name rules", () => {
    // The worker doesn't cap the org half; 64+ chars or `--` inside are
    // its call, not the portal's.
    const longOrg = `${"a".repeat(100)}/fia`;
    expect(buildShareLinkFromCode("15550100100", longOrg).ok).toBe(true);
    expect(buildShareLinkFromCode("15550100100", "a--b/-x-").ok).toBe(true);
    // A qualified clear word is not a clear token to the worker.
    expect(buildShareLinkFromCode("15550100100", "pbt/default").ok).toBe(true);
  });

  it("refuses only what can't be carried in a URL", () => {
    for (const bad of [
      "",
      "Fia",
      "pbt/obt coach",
      "a/b/c",
      "/fia",
      "pbt/",
      "fia&text=x",
      "#fia",
      "a".repeat(201),
    ]) {
      expect(buildShareLinkFromCode("15550100100", bad), bad).toEqual({
        ok: false,
        reason: "code-unencodable",
      });
    }
    expect(isUrlSafeShareCode("a".repeat(200))).toBe(true);
  });

  it("checks the number first, like the bare builder", () => {
    expect(buildShareLinkFromCode(null, "pbt/x")).toEqual({
      ok: false,
      reason: "number-missing",
    });
    expect(buildShareLinkFromCode("nope", "pbt/x")).toEqual({
      ok: false,
      reason: "number-invalid",
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

// #345 — the panel renders the WORKER's share-code answer
// (bt-servant-worker#477). These pin that every answer maps to one state,
// that a link is built only from a code that resolves, and that no state
// shows a trigger the worker didn't hand back.
describe("resolveModeSharePanelState", () => {
  const config: ShareConfigSnapshot = {
    pending: false,
    error: false,
    fetching: false,
    supported: true,
    whatsappNumber: "+57 300 123 4567",
  };
  const ready = { published: true, requires_group: false };
  const settled: ShareCodeSnapshot = {
    answer: undefined,
    checking: false,
    failure: null,
    sync: "agree",
  };
  type Present = Extract<ModeShareCodeResponse, { capability: "present" }>;
  const answer = (
    a: Omit<Present, "capability" | "home_org"> & { home_org?: string }
  ): Present => ({ capability: "present", home_org: "unfoldingWord", ...a });
  const present = (
    a: Omit<Present, "capability" | "home_org"> & { home_org?: string }
  ): ShareCodeSnapshot => ({ ...settled, answer: answer(a) });
  const code = (data: ModeShareCode): ShareCodeSnapshot => ({
    ...settled,
    answer: data,
  });
  const home = present({ code: "fia", resolves: true, resolved_org: "acme" });
  const partner = present({
    code: "pbt/obt-coach",
    resolves: true,
    resolved_org: "PBT",
  });
  const partnerShown = { trigger: "#pbt/obt-coach", partnerOrg: "PBT" };
  const partnerReady = {
    kind: "ready",
    url: "https://wa.me/573001234567?text=%23pbt%2Fobt-coach",
    ...partnerShown,
  };
  const miss = (reason: string | undefined, resolvedOrg?: string) =>
    present({
      code: "pbt/obt-coach",
      resolves: false,
      ...(reason !== undefined ? { reason } : {}),
      ...(resolvedOrg !== undefined ? { resolved_org: resolvedOrg } : {}),
    });
  const run = (
    shareCode: ShareCodeSnapshot,
    opts: {
      config?: ShareConfigSnapshot;
      flags?: { published?: boolean; requires_group?: boolean };
      org?: string | null;
      name?: string;
    } = {}
  ) =>
    resolveModeSharePanelState(
      opts.config ?? config,
      shareCode,
      opts.flags ?? ready,
      opts.org === undefined ? "PBT" : opts.org,
      opts.name ?? "obt-coach"
    );

  it("builds a home mode's bare link from the worker's code", () => {
    expect(run(home, { org: "acme", name: "fia" })).toEqual({
      kind: "ready",
      url: "https://wa.me/573001234567?text=%23fia",
      trigger: "#fia",
      partnerOrg: null,
    });
  });

  it("builds a partner mode's qualified link from the worker's code", () => {
    expect(run(partner)).toEqual(partnerReady);
  });

  it("trusts a resolving code the portal's own name rules would reject", () => {
    const long = `${"o".repeat(80)}/obt-coach`;
    expect(run(present({ code: long, resolves: true }))).toMatchObject({
      kind: "ready",
      trigger: `#${long}`,
    });
  });

  it("refuses a resolving code no URL can carry with its own state", () => {
    for (const bad of ["Fia", "pbt/obt coach", "a/b/c", "pbt/"]) {
      expect(run(present({ code: bad, resolves: true })), bad).toEqual({
        kind: "code-unencodable",
      });
    }
  });

  it("checks URL safety only for a code that resolves; otherwise the reason's copy", () => {
    expect(
      run(present({ code: "Odd Code", resolves: false, reason: "capped" }))
    ).toEqual({ kind: "capped", trigger: "#Odd Code", partnerOrg: null });
  });

  it("maps every worker reason to its own state, carrying the code", () => {
    expect(run(miss("collision", "pbt"))).toEqual({
      kind: "collision",
      resolvedOrg: "pbt",
      ...partnerShown,
    });
    // #477: a collision whose winner is hidden has no resolved_org.
    expect(run(miss("collision"))).toEqual({
      kind: "collision",
      resolvedOrg: null,
      ...partnerShown,
    });
    expect(run(miss("ambiguous", "Other Org"))).toEqual({
      kind: "ambiguous",
      resolvedOrg: "Other Org",
      ...partnerShown,
    });
    expect(run(miss("capped"))).toEqual({ kind: "capped", ...partnerShown });
    expect(run(miss("org_skipped"))).toEqual({
      kind: "org-skipped",
      ...partnerShown,
    });
    expect(run(miss("not_found"))).toEqual({
      kind: "unresolved",
      ...partnerShown,
    });
    expect(run(miss("reserved"))).toEqual({ kind: "slug-reserved" });
    expect(run(miss("draft"), { flags: {} })).toEqual({
      kind: "draft",
      ...partnerShown,
    });
    expect(
      run(miss("requires_group"), {
        flags: { published: true, requires_group: true },
      })
    ).toEqual({ kind: "group-only", ...partnerShown });
  });

  it("shows the sync states the hook derives instead of a disputed reason", () => {
    expect(run({ ...miss("draft"), sync: "checking" })).toEqual({
      kind: "syncing",
    });
    expect(run({ ...miss("draft"), sync: "behind" })).toEqual({
      kind: "out-of-sync",
    });
    // Agreed after the re-read (the page's flags were the stale side):
    // the worker's answer is shown as is.
    expect(run({ ...miss("draft"), sync: "agree" })).toEqual({
      kind: "draft",
      ...partnerShown,
    });
  });

  it("treats a missing or unknown reason (e.g. `pending`) as not resolving, with generic copy", () => {
    for (const reason of [undefined, "pending", "some_future_reason"]) {
      expect(run(miss(reason)), String(reason)).toEqual({
        kind: "unresolved",
        ...partnerShown,
      });
    }
  });

  it("never builds a link from a code that does not resolve, whatever the number", () => {
    for (const reason of ["collision", "capped", "ambiguous", "not_found"]) {
      expect(run(miss(reason))).not.toHaveProperty("url");
    }
  });

  it("refuses an org that slugs to nothing (code null) without a trigger", () => {
    expect(
      run(present({ code: null, resolves: false, reason: "org_skipped" }))
    ).toEqual({ kind: "org-unencodable" });
  });

  it("maps each non-answer to its own state, none of them showing a trigger", () => {
    expect(run(code({ capability: "not-found" }))).toEqual({
      kind: "not-found",
    });
    expect(run(code({ capability: "unconfigured" }))).toEqual({
      kind: "org-unconfigured",
    });
    expect(run(code({ capability: "absent", home: false }))).toEqual({
      kind: "upgrade-needed",
    });
    for (const failure of [
      "signed-out",
      "forbidden",
      "invalid-name",
      "org-invalid",
      "bad-request",
      "corrupt-record",
    ] as const) {
      expect(run(code({ capability: "failed", failure }))).toEqual({
        kind: "failed",
        failure,
      });
    }
  });

  it("keeps sharing a home mode by its bare slug on a worker without the route", () => {
    const absentHome = code({ capability: "absent", home: true });
    expect(run(absentHome, { org: "acme", name: "fia" })).toEqual({
      kind: "ready",
      url: "https://wa.me/573001234567?text=%23fia",
      trigger: "#fia",
      partnerOrg: null,
    });
    // ...with the page's own flags standing in for the worker's verdict,
    // draft first as the worker orders them.
    expect(
      run(absentHome, {
        org: "acme",
        name: "fia",
        flags: { published: false, requires_group: true },
      })
    ).toEqual({ kind: "draft", trigger: "#fia", partnerOrg: null });
    expect(
      run(absentHome, {
        org: "acme",
        name: "fia",
        flags: { published: true, requires_group: true },
      })
    ).toEqual({ kind: "group-only", trigger: "#fia", partnerOrg: null });
  });

  it("checks while there is no current answer and a fetch runs (first load, reopen)", () => {
    expect(run({ ...settled, checking: true })).toEqual({ kind: "loading" });
    expect(run(partner, { config: { ...config, fetching: true } })).toEqual({
      kind: "loading",
    });
    expect(run(partner, { config: { ...config, pending: true } })).toEqual({
      kind: "loading",
    });
  });

  it("names a transient failure with no answer on the card, with its cause", () => {
    for (const cause of ["unavailable", "server", "network"] as const) {
      expect(run({ ...settled, failure: cause })).toEqual({
        kind: "retry",
        cause,
      });
    }
  });

  it("keeps the answer on the card when a background refresh fails", () => {
    // TanStack keeps `data` on a refetch error; the hook keeps it current.
    expect(run({ ...partner, failure: "network" })).toEqual(partnerReady);
  });

  it("keeps the settings error for share-config failures only", () => {
    expect(run(partner, { config: { ...config, error: true } })).toEqual({
      kind: "error",
    });
  });

  it("names the mode's identity first, before any request state", () => {
    const loading: ShareCodeSnapshot = { ...settled, checking: true };
    expect(run(loading, { name: "Fia Mode" })).toEqual({
      kind: "slug-invalid",
    });
    expect(run(loading, { name: "default" })).toEqual({
      kind: "slug-reserved",
    });
    // A stored slug never contains `/`, whatever the worker would say.
    expect(run(partner, { name: "pbt/obt-coach" })).toEqual({
      kind: "slug-invalid",
    });
  });

  it("puts the worker's verdict ahead of the number", () => {
    const noNumber = { ...config, whatsappNumber: null };
    expect(run(miss("capped"), { config: noNumber })).toEqual({
      kind: "capped",
      ...partnerShown,
    });
    expect(run(partner, { config: noNumber })).toEqual({
      kind: "unconfigured",
      ...partnerShown,
    });
    expect(
      run(partner, { config: { ...config, whatsappNumber: "nope" } })
    ).toEqual({ kind: "number-invalid", ...partnerShown });
    expect(
      run(partner, {
        config: { ...config, supported: false, whatsappNumber: null },
      })
    ).toEqual({ kind: "unconfigured", ...partnerShown });
  });
});

describe("refreshFailed and retryControl", () => {
  const snap = (over: Partial<ShareCodeSnapshot> = {}): ShareCodeSnapshot => ({
    answer: undefined,
    checking: false,
    failure: null,
    sync: "agree",
    ...over,
  });
  const readyState: ModeSharePanelState = {
    kind: "ready",
    url: "https://wa.me/1?text=%23x",
    trigger: "#x",
    partnerOrg: null,
  };
  const idle = { target: null, fetching: false };

  it("notes a failed refresh only while an answer is on the card", () => {
    expect(refreshFailed(readyState, snap({ failure: "network" }))).toBe(true);
    expect(refreshFailed(readyState, snap())).toBe(false);
    // No code on the card: the failure IS the state, not a note.
    expect(
      refreshFailed(
        { kind: "retry", cause: "network" },
        snap({ failure: "network" })
      )
    ).toBe(false);
    expect(
      refreshFailed({ kind: "loading" }, snap({ failure: "server" }))
    ).toBe(false);
  });

  it("offers Try again with the note, re-asking the share code", () => {
    expect(
      retryControl(readyState, snap({ failure: "network" }), idle)
    ).toEqual({
      target: "share-code",
      busy: false,
    });
    expect(retryControl(readyState, snap(), idle)).toBeNull();
  });

  it("re-asks only the query that failed", () => {
    expect(retryControl({ kind: "error" }, snap(), idle)).toEqual({
      target: "config",
      busy: false,
    });
    expect(
      retryControl({ kind: "retry", cause: "unavailable" }, snap(), idle)
    ).toEqual({ target: "share-code", busy: false });
    expect(retryControl({ kind: "out-of-sync" }, snap(), idle)).toEqual({
      target: "share-code",
      busy: false,
    });
    // Definite answers get no Try again.
    expect(
      retryControl({ kind: "failed", failure: "corrupt-record" }, snap(), idle)
    ).toBeNull();
  });

  it("stays visible and disabled while its re-ask runs, even once the state is loading", () => {
    // Try again on the settings error: share-config refetches, the state
    // turns to loading, and the button must stay, busy.
    expect(
      retryControl({ kind: "loading" }, snap(), {
        target: "config",
        fetching: true,
      })
    ).toEqual({ target: "config", busy: true });
    expect(
      retryControl({ kind: "syncing" }, snap(), {
        target: "share-code",
        fetching: true,
      })
    ).toEqual({ target: "share-code", busy: true });
    // Settled: back to whatever the state calls for.
    expect(
      retryControl({ kind: "loading" }, snap(), {
        target: "config",
        fetching: false,
      })
    ).toBeNull();
  });
});

describe("shareCodeDisagreesWithFlags", () => {
  const base = {
    capability: "present" as const,
    home_org: "unfoldingWord",
    code: "pbt/x",
  };
  it("agrees when the worker's static reason matches the page's flags", () => {
    const published = { published: true };
    expect(
      shareCodeDisagreesWithFlags({ ...base, resolves: true }, published)
    ).toBe(false);
    expect(
      shareCodeDisagreesWithFlags(
        { ...base, resolves: false, reason: "capped" },
        published
      )
    ).toBe(false);
    expect(
      shareCodeDisagreesWithFlags(
        { ...base, resolves: false, reason: "draft" },
        { published: false, requires_group: true }
      )
    ).toBe(false);
  });

  it("ignores answers without a code and non-answers", () => {
    expect(
      shareCodeDisagreesWithFlags(
        { ...base, code: null, resolves: false, reason: "org_skipped" },
        {}
      )
    ).toBe(false);
    expect(shareCodeDisagreesWithFlags({ capability: "not-found" }, {})).toBe(
      false
    );
    expect(shareCodeDisagreesWithFlags(undefined, {})).toBe(false);
  });
});

describe("homeOrgWithoutModes", () => {
  const base = {
    capability: "present" as const,
    code: "pbt/x",
    resolves: true,
    home_org: "unfoldingWord",
  };
  it("names the gateway org only when the worker says it has no modes", () => {
    expect(homeOrgWithoutModes({ ...base, home_has_modes: false })).toBe(
      "unfoldingWord"
    );
    expect(homeOrgWithoutModes({ ...base, home_has_modes: true })).toBeNull();
    expect(homeOrgWithoutModes(base)).toBeNull();
    expect(homeOrgWithoutModes(undefined)).toBeNull();
    expect(homeOrgWithoutModes({ capability: "not-found" })).toBeNull();
  });
});

describe("shownTrigger", () => {
  it("returns the code only for states that carry one", () => {
    expect(shownTrigger({ kind: "loading" })).toBeNull();
    expect(shownTrigger({ kind: "upgrade-needed" })).toBeNull();
    expect(
      shownTrigger({ kind: "capped", trigger: "#pbt/x", partnerOrg: "PBT" })
    ).toEqual({ trigger: "#pbt/x", partnerOrg: "PBT" });
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
