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
  answerUncertain,
  hasUsableWhatsAppNumber,
  homeOrgWithoutModes,
  nextRetryClick,
  refreshFailed,
  retryControl,
  workerSaysUnshareable,
  shareCodeSnapshot,
  shareCodeStart,
  type ShareCodeQueryView,
  shownTrigger,
  type ModeSharePanelState,
  type ShareCodeSnapshot,
  type ShareConfigSnapshot,
} from "../src/lib/mode-share-link";
import {
  ShareCodeRequestError,
  type ModeShareCode,
} from "../src/lib/mode-share-code-api";
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
describe("nextRetryClick", () => {
  const idle = { config: "idle", "share-code": "idle" } as const;
  const busy = { config: "idle", "share-code": "fetching" } as const;
  const offline = { config: "idle", "share-code": "paused" } as const;
  const click = { target: "share-code", started: false } as const;

  it("stays busy from the click until the retried query has fetched and stopped", () => {
    // Click render: not fetching yet, still busy.
    expect(nextRetryClick(click, idle)).toBe(click);
    const started = nextRetryClick(click, busy);
    expect(started).toEqual({ ...click, started: true });
    // A cancel-and-restart (mode write) keeps it fetching: still busy.
    expect(nextRetryClick(started, busy)).toBe(started);
    expect(nextRetryClick(started, idle)).toBeNull();
  });

  it("ends when the retried query is paused offline, so Try again stays usable", () => {
    expect(nextRetryClick(click, offline)).toBeNull();
    expect(nextRetryClick({ ...click, started: true }, offline)).toBeNull();
  });

  it("follows the target's own query, not the other one", () => {
    const config = { target: "config", started: true } as const;
    expect(nextRetryClick(config, busy)).toBeNull();
    expect(nextRetryClick(null, busy)).toBeNull();
  });
});

describe("resolveModeSharePanelState", () => {
  const config: ShareConfigSnapshot = {
    pending: false,
    paused: false,
    error: false,
    supported: true,
    whatsappNumber: "+57 300 123 4567",
  };
  const ready = { published: true, requires_group: false };
  const settled: ShareCodeSnapshot = {
    answer: undefined,
    checking: false,
    failure: null,
  };
  type Present = Extract<ModeShareCodeResponse, { capability: "present" }>;
  type AnswerFields = Omit<
    Present,
    "capability" | "home_org" | "queried_org"
  > & { home_org?: string; queried_org?: string };
  const answer = (a: AnswerFields): Present => ({
    capability: "present",
    home_org: "unfoldingWord",
    queried_org: "PBT",
    ...a,
  });
  const present = (a: AnswerFields): ShareCodeSnapshot => ({
    ...settled,
    answer: answer(a),
  });
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
    expect(run(home, { org: "acme" })).toEqual({
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
      sameOrg: false,
      uncertain: false,
      ...partnerShown,
    });
    // #477: a collision whose winner is hidden (or stripped by the BFF:
    // another org's name, for a non-super-admin) has no resolved_org.
    expect(run(miss("collision"))).toEqual({
      kind: "collision",
      resolvedOrg: null,
      sameOrg: false,
      uncertain: false,
      ...partnerShown,
    });
    // #477 cd20c99: an alias clash inside this same org names this org.
    expect(run(miss("collision", "PBT"))).toEqual({
      kind: "collision",
      resolvedOrg: "PBT",
      sameOrg: true,
      uncertain: false,
      ...partnerShown,
    });
    expect(run(miss("ambiguous", "Other Org"))).toEqual({
      kind: "ambiguous",
      resolvedOrg: "Other Org",
      uncertain: false,
      ...partnerShown,
    });
    expect(run(miss("capped"))).toEqual({ kind: "capped", ...partnerShown });
    expect(run(miss("org_skipped"))).toEqual({
      kind: "org-skipped",
      ...partnerShown,
    });
    expect(run(miss("not_found"))).toEqual({
      kind: "unresolved",
      uncertain: false,
      ...partnerShown,
    });
    expect(run(miss("reserved"))).toEqual({ kind: "slug-reserved" });
  });

  it("marks a verdict that rests on an org the worker couldn't read, with Try again", () => {
    // #477: resolved_org_uncertain, with resolved_org omitted.
    const uncertain = (reason: string) =>
      present({
        code: "pbt/obt-coach",
        resolves: false,
        reason,
        resolved_org_uncertain: true,
      });
    const collision = run(uncertain("collision"));
    expect(collision).toEqual({
      kind: "collision",
      resolvedOrg: null,
      sameOrg: false,
      uncertain: true,
      ...partnerShown,
    });
    expect(run(uncertain("ambiguous"))).toMatchObject({
      kind: "ambiguous",
      resolvedOrg: null,
      uncertain: true,
    });
    expect(run(uncertain("not_found"))).toMatchObject({
      kind: "unresolved",
      uncertain: true,
    });
    for (const state of [collision, run(uncertain("not_found"))]) {
      expect(answerUncertain(state)).toBe(true);
      expect(retryControl(state, settled, null)).toEqual({
        target: "share-code",
        busy: false,
      });
    }
    // A firm verdict gets neither the line nor Try again.
    const firm = run(miss("collision", "pbt"));
    expect(answerUncertain(firm)).toBe(false);
    expect(retryControl(firm, settled, null)).toBeNull();
  });

  it("names a damaged stored mode (invalid_mode) as permanent, with no Try again", () => {
    const state = run(miss("invalid_mode"));
    expect(state).toEqual({ kind: "invalid-mode" });
    expect(
      retryControl(state, { ...settled, answer: undefined }, null)
    ).toBeNull();
  });

  it("shows org_skipped on a published mode as the worker's answer, as is", () => {
    expect(run(miss("org_skipped"), { flags: ready })).toEqual({
      kind: "org-skipped",
      ...partnerShown,
    });
  });

  it("refuses a draft or group-only mode from the page's own flags, without the worker", () => {
    // Whatever the worker would say (here it isn't even asked: the answer
    // is still loading), the page's saved flags decide, draft first.
    const unasked: ShareCodeSnapshot = { ...settled, checking: true };
    expect(
      run(unasked, { flags: { published: false, requires_group: true } })
    ).toEqual({ kind: "draft" });
    expect(
      run(unasked, { flags: { published: true, requires_group: true } })
    ).toEqual({ kind: "group-only" });
  });

  it("decides same-org against the exact org the BFF queried, never trimmed", () => {
    const clash = (queried: string, resolved: string) =>
      present({
        code: "pbt/obt-coach",
        resolves: false,
        reason: "collision",
        resolved_org: resolved,
        queried_org: queried,
      });
    // A super-admin on a legacy padded org: the BFF queried " PBT".
    expect(run(clash(" PBT", " PBT"), { org: " PBT" })).toMatchObject({
      kind: "collision",
      sameOrg: true,
    });
    // " PBT" and "PBT" are different orgs to the worker, either way round,
    // whatever the page calls the mode's org.
    expect(run(clash(" PBT", "PBT"), { org: "PBT" })).toMatchObject({
      sameOrg: false,
    });
    expect(run(clash("PBT", " PBT"), { org: " PBT" })).toMatchObject({
      sameOrg: false,
    });
  });

  it("checks the name before the page's flags: a draft named `default` hears rename", () => {
    const unasked: ShareCodeSnapshot = { ...settled, checking: true };
    expect(
      run(unasked, { flags: { published: false }, name: "default" })
    ).toEqual({ kind: "slug-reserved" });
    expect(
      run(unasked, { flags: { published: false }, name: "Fia Mode" })
    ).toEqual({ kind: "slug-invalid" });
    expect(
      run(unasked, {
        flags: { published: true, requires_group: true },
        name: "none",
      })
    ).toEqual({ kind: "slug-reserved" });
    // The worker's own answers for the same cases map to the same states.
    expect(run(miss("reserved"))).toEqual({ kind: "slug-reserved" });
    expect(
      run(code({ capability: "failed", failure: "invalid-name" }))
    ).toEqual({ kind: "failed", failure: "invalid-name" });
  });

  it("keeps the page's draft / group-only in charge (the worker isn't asked then)", () => {
    for (const flags of [
      { published: false },
      { published: true, requires_group: true },
    ]) {
      // Even if a stale answer from an earlier publish were around.
      expect(run(miss("invalid_mode"), { flags })).toEqual({
        kind: flags.published ? "group-only" : "draft",
      });
    }
  });

  it("reads a missing code by its reason first", () => {
    const noCode = (reason?: string) =>
      present({
        code: null,
        resolves: false,
        ...(reason !== undefined ? { reason } : {}),
      });
    expect(run(noCode("draft"))).toEqual({
      kind: "worker-sees",
      sees: "draft",
    });
    expect(run(noCode("requires_group"))).toEqual({
      kind: "worker-sees",
      sees: "group-only",
    });
    expect(run(noCode("invalid_mode"))).toEqual({ kind: "invalid-mode" });
    expect(run(noCode("reserved"))).toEqual({ kind: "slug-reserved" });
    // Reasons that need a code to point at read as an unusable org name.
    for (const reason of ["org_skipped", "collision", "capped", undefined]) {
      expect(run(noCode(reason)), String(reason)).toEqual({
        kind: "org-unencodable",
      });
    }
  });

  it("says what BT Servant sees when it says draft / group-only for a page-published mode", () => {
    // Either side may be stale: the state says what BT Servant sees.
    expect(run(miss("draft"))).toEqual({ kind: "worker-sees", sees: "draft" });
    expect(run(miss("requires_group"))).toEqual({
      kind: "worker-sees",
      sees: "group-only",
    });
  });

  it("treats a missing or unknown reason (e.g. `pending`) as not resolving, with generic copy", () => {
    for (const reason of [undefined, "pending", "some_future_reason"]) {
      expect(run(miss(reason)), String(reason)).toEqual({
        kind: "unresolved",
        uncertain: false,
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
    expect(run(code({ capability: "upgrade-needed" }))).toEqual({
      kind: "upgrade-needed",
    });
    for (const failure of [
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

  it("offers no code for any mode on a worker without the route, home included", () => {
    const upgrade = code({ capability: "upgrade-needed" });
    for (const org of ["acme", "unfoldingWord", "PBT"]) {
      const state = run(upgrade, { org });
      expect(state).toEqual({ kind: "upgrade-needed" });
      expect(shownTrigger(state)).toBeNull();
    }
  });

  it("checks while there is no current answer and a fetch runs (first load, reopen)", () => {
    expect(run({ ...settled, checking: true })).toEqual({
      kind: "checking-code",
    });
    expect(run(partner, { config: { ...config, pending: true } })).toEqual({
      kind: "loading-config",
    });
  });

  it("names share-config offline before it ever loaded as the settings error, with Try again", () => {
    const state = run(partner, {
      config: { ...config, pending: true, paused: true },
    });
    expect(state).toEqual({ kind: "error" });
    expect(retryControl(state, settled, null)).toEqual({
      target: "config",
      busy: false,
    });
  });

  it("keeps a ready QR through a share-config background refetch or its failure", () => {
    // Only a first load (no data) blocks; the panel passes `error` only
    // when there is nothing to fall back on.
    const before = run(partner);
    expect(before.kind).toBe("ready");
    expect(run(partner, { config: { ...config } })).toEqual(before);
    expect(run(partner, { config: { ...config, error: true } })).toEqual({
      kind: "error",
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

  it("leaves the mode's name to the worker: reserved and invalid names are its answers", () => {
    // No local name check: the worker answers `reserved` or 400
    // invalid_mode_name, and the panel says so.
    expect(run(miss("reserved"))).toEqual({ kind: "slug-reserved" });
    expect(
      run(code({ capability: "failed", failure: "invalid-name" }))
    ).toEqual({ kind: "failed", failure: "invalid-name" });
    // While it is asked, the panel checks rather than refusing up front.
    expect(run({ ...settled, checking: true })).toEqual({
      kind: "checking-code",
    });
  });

  it("checks the number before the worker, which isn't asked without a usable one", () => {
    const unasked: ShareCodeSnapshot = { ...settled, checking: true };
    for (const [over, kind] of [
      [{ whatsappNumber: null }, "unconfigured"],
      [{ whatsappNumber: "  " }, "unconfigured"],
      [{ supported: false, whatsappNumber: null }, "unconfigured"],
      [{ whatsappNumber: "nope" }, "number-invalid"],
    ] as const) {
      const state = run(unasked, { config: { ...config, ...over } });
      expect(state, JSON.stringify(over)).toEqual({ kind });
      expect(shownTrigger(state)).toBeNull();
    }
    // Name and flags still come first.
    expect(
      run(unasked, {
        config: { ...config, whatsappNumber: null },
        flags: { published: false },
      })
    ).toEqual({ kind: "draft" });
    expect(hasUsableWhatsAppNumber("+57 300 123 4567")).toBe(true);
    expect(hasUsableWhatsAppNumber("nope")).toBe(false);
    expect(hasUsableWhatsAppNumber(null)).toBe(false);
  });
});

describe("refreshFailed and retryControl", () => {
  const snap = (over: Partial<ShareCodeSnapshot> = {}): ShareCodeSnapshot => ({
    answer: undefined,
    checking: false,
    failure: null,
    ...over,
  });
  const readyState: ModeSharePanelState = {
    kind: "ready",
    url: "https://wa.me/1?text=%23x",
    trigger: "#x",
    partnerOrg: null,
  };
  const idle = null;

  const lastAnswer = {
    capability: "present" as const,
    home_org: "uW",
    queried_org: "PBT",
    code: "x",
    resolves: true,
  };

  it("notes a failed refresh while the worker's last answer is shown", () => {
    expect(
      refreshFailed(
        readyState,
        snap({ answer: lastAnswer, failure: "network" })
      )
    ).toBe(true);
    expect(refreshFailed(readyState, snap({ answer: lastAnswer }))).toBe(false);
    // No answer shown: the failure IS the state, not a note.
    expect(
      refreshFailed(
        { kind: "retry", cause: "network" },
        snap({ failure: "network" })
      )
    ).toBe(false);
    expect(
      refreshFailed({ kind: "checking-code" }, snap({ failure: "server" }))
    ).toBe(false);
  });

  it("offers Try again with the note, re-asking the share code", () => {
    expect(
      retryControl(
        readyState,
        snap({ answer: lastAnswer, failure: "network" }),
        idle
      )
    ).toEqual({
      target: "share-code",
      busy: false,
    });
    expect(
      retryControl(readyState, snap({ answer: lastAnswer }), idle)
    ).toBeNull();
  });

  it("notes a failed refresh over a definite state too, with Try again", () => {
    const failedRefresh = (answer: ModeShareCode) =>
      snap({ answer, failure: "server" });
    const cases: [ModeSharePanelState, ModeShareCode][] = [
      [{ kind: "not-found" }, { capability: "not-found" }],
      [
        { kind: "failed", failure: "invalid-name" },
        { capability: "failed", failure: "invalid-name" },
      ],
      [
        { kind: "slug-reserved" },
        { ...lastAnswer, resolves: false, reason: "reserved" },
      ],
      [{ kind: "upgrade-needed" }, { capability: "upgrade-needed" }],
      [{ kind: "org-unconfigured" }, { capability: "unconfigured" }],
      [
        { kind: "invalid-mode" },
        { ...lastAnswer, resolves: false, reason: "invalid_mode" },
      ],
      [
        { kind: "org-unencodable" },
        { ...lastAnswer, code: null, resolves: false },
      ],
    ];
    for (const [state, answer] of cases) {
      expect(refreshFailed(state, failedRefresh(answer)), state.kind).toBe(
        true
      );
      expect(
        retryControl(state, failedRefresh(answer), idle),
        state.kind
      ).toEqual({ target: "share-code", busy: false });
    }
    // The page's own flags are not the worker's answer: no note.
    expect(
      refreshFailed(
        { kind: "draft" },
        failedRefresh({ capability: "not-found" })
      )
    ).toBe(false);
  });

  it("re-asks only the query that failed", () => {
    expect(retryControl({ kind: "error" }, snap(), idle)).toEqual({
      target: "config",
      busy: false,
    });
    expect(
      retryControl({ kind: "retry", cause: "unavailable" }, snap(), idle)
    ).toEqual({ target: "share-code", busy: false });
    expect(
      retryControl({ kind: "worker-sees", sees: "draft" }, snap(), idle)
    ).toEqual({
      target: "share-code",
      busy: false,
    });
    // Definite answers get no Try again.
    expect(
      retryControl({ kind: "failed", failure: "corrupt-record" }, snap(), idle)
    ).toBeNull();
  });

  it("stays visible and disabled while its re-ask runs, even once the state is checking", () => {
    // Try again on the settings error: share-config refetches, and the
    // button must stay, busy, until that query has fetched and stopped.
    expect(retryControl({ kind: "loading-config" }, snap(), "config")).toEqual({
      target: "config",
      busy: true,
    });
    expect(
      retryControl({ kind: "checking-code" }, snap(), "share-code")
    ).toEqual({ target: "share-code", busy: true });
    // Settled (busy cleared): back to whatever the state calls for.
    expect(retryControl({ kind: "checking-code" }, snap(), null)).toBeNull();
  });
});

describe("workerSaysUnshareable", () => {
  const base = {
    capability: "present" as const,
    home_org: "unfoldingWord",
    queried_org: "PBT",
    code: "pbt/x",
  };
  it("is true only for a draft / group-only answer (never cached)", () => {
    expect(
      workerSaysUnshareable({ ...base, resolves: false, reason: "draft" })
    ).toBe(true);
    expect(
      workerSaysUnshareable({
        ...base,
        resolves: false,
        reason: "requires_group",
      })
    ).toBe(true);
    expect(
      workerSaysUnshareable({ ...base, resolves: false, reason: "org_skipped" })
    ).toBe(false);
    expect(workerSaysUnshareable({ ...base, resolves: true })).toBe(false);
    expect(workerSaysUnshareable({ capability: "not-found" })).toBe(false);
    expect(workerSaysUnshareable(undefined)).toBe(false);
  });
});

// The panel mounts the share-code query once per open, so "after mount"
// (TanStack's isFetchedAfterMount) means "in this open". `start` is the
// one thing the hook takes at the first render it asks.
describe("per-open snapshot: shareCodeStart and shareCodeSnapshot", () => {
  const answerA = {
    capability: "present" as const,
    home_org: "uW",
    queried_org: "PBT",
    code: "pbt/a",
    resolves: true,
  };
  const view = (over: Partial<ShareCodeQueryView>): ShareCodeQueryView => ({
    data: undefined,
    dataUpdatedAt: 0,
    fetchStatus: "idle",
    error: null,
    isFetchedAfterMount: false,
    ...over,
  });

  it("takes a fresh start only from an idle first look at cached data", () => {
    // TanStack's first result is optimistic: a stale answer already shows
    // as fetching (or paused, offline).
    expect(shareCodeStart(view({ data: answerA, dataUpdatedAt: 100 }))).toEqual(
      { fresh: true, dataUpdatedAt: 100 }
    );
    for (const fetchStatus of ["fetching", "paused"] as const) {
      expect(
        shareCodeStart(view({ data: answerA, dataUpdatedAt: 100, fetchStatus }))
          .fresh
      ).toBe(false);
    }
    expect(shareCodeStart(view({})).fresh).toBe(false);
  });

  it("checks on a reopen past the stale time, then shows the fresh answer", () => {
    const first = view({
      data: answerA,
      dataUpdatedAt: 100,
      fetchStatus: "fetching",
    });
    const start = shareCodeStart(first);
    expect(shareCodeSnapshot(first, start)).toEqual({
      answer: undefined,
      checking: true,
      failure: null,
    });
    expect(
      shareCodeSnapshot(
        view({ data: answerA, dataUpdatedAt: 150, isFetchedAfterMount: true }),
        start
      )
    ).toEqual({ answer: answerA, checking: false, failure: null });
  });

  it("never offers a previous open's answer when this open's refetch failed", () => {
    const start = shareCodeStart(
      view({ data: answerA, dataUpdatedAt: 100, fetchStatus: "fetching" })
    );
    const failed = shareCodeSnapshot(
      view({
        data: answerA,
        dataUpdatedAt: 100,
        error: new ShareCodeRequestError("network"),
        isFetchedAfterMount: true,
      }),
      start
    );
    expect(failed).toEqual({
      answer: undefined,
      checking: false,
      failure: "network",
    });
    expect(
      resolveModeSharePanelState(
        {
          pending: false,
          paused: false,
          error: false,
          supported: true,
          whatsappNumber: "15550100100",
        },
        failed,
        { published: true },
        "PBT",
        "a"
      )
    ).toEqual({ kind: "retry", cause: "network" });
  });

  it("never shows a previous open's failed refresh on a fresh open", () => {
    // The last open's background refresh failed: the cache still holds
    // that error next to a fresh answer. This mount fetched nothing yet,
    // so the error isn't this open's.
    const cached = view({
      data: answerA,
      dataUpdatedAt: 100,
      error: new ShareCodeRequestError("server"),
    });
    expect(shareCodeSnapshot(cached, shareCodeStart(cached))).toEqual({
      answer: answerA,
      checking: false,
      failure: null,
    });
    // With no answer at all, a stale error is not shown either: it checks.
    const empty = view({
      error: new ShareCodeRequestError("server"),
      fetchStatus: "fetching",
    });
    expect(shareCodeSnapshot(empty, shareCodeStart(empty))).toEqual({
      answer: undefined,
      checking: true,
      failure: null,
    });
  });

  it("names offline (paused) as the network failure with Try again, not checking", () => {
    const paused = view({ fetchStatus: "paused" });
    const snap = shareCodeSnapshot(paused, shareCodeStart(paused));
    expect(snap).toEqual({
      answer: undefined,
      checking: false,
      failure: "network",
    });
    const config: ShareConfigSnapshot = {
      pending: false,
      paused: false,
      error: false,
      supported: true,
      whatsappNumber: "15550100100",
    };
    const state = resolveModeSharePanelState(
      config,
      snap,
      { published: true },
      "PBT",
      "a"
    );
    expect(state).toEqual({ kind: "retry", cause: "network" });
    expect(retryControl(state, snap, null)).toEqual({
      target: "share-code",
      busy: false,
    });
    // Paused under an answer shown this open: kept, with the refresh note.
    const start = shareCodeStart(view({ data: answerA, dataUpdatedAt: 100 }));
    expect(
      shareCodeSnapshot(
        view({ data: answerA, dataUpdatedAt: 100, fetchStatus: "paused" }),
        start
      )
    ).toEqual({ answer: answerA, checking: false, failure: "network" });
  });

  it("keeps a fresh cached answer shown at reopen through a later background refetch", () => {
    const first = view({ data: answerA, dataUpdatedAt: 100 });
    const start = shareCodeStart(first);
    expect(shareCodeSnapshot(first, start)).toEqual({
      answer: answerA,
      checking: false,
      failure: null,
    });
    // A mode write invalidates it: the refetch runs in the background and
    // the card keeps the answer.
    expect(
      shareCodeSnapshot({ ...first, fetchStatus: "fetching" }, start)
    ).toEqual({ answer: answerA, checking: false, failure: null });
    // A failed background refetch keeps it too, with the failure noted.
    expect(
      shareCodeSnapshot(
        {
          ...first,
          error: new ShareCodeRequestError("server"),
          isFetchedAfterMount: true,
        },
        start
      )
    ).toEqual({ answer: answerA, checking: false, failure: "server" });
  });

  it("names a first-load failure in this open, with no answer", () => {
    const start = shareCodeStart(view({ fetchStatus: "fetching" }));
    expect(
      shareCodeSnapshot(
        view({
          error: new ShareCodeRequestError("unavailable"),
          isFetchedAfterMount: true,
        }),
        start
      )
    ).toEqual({ answer: undefined, checking: false, failure: "unavailable" });
    expect(
      shareCodeSnapshot(
        view({ error: new Error("boom"), isFetchedAfterMount: true }),
        start
      ).failure
    ).toBe("server");
  });
});

describe("homeOrgWithoutModes", () => {
  const base = {
    capability: "present" as const,
    code: "pbt/x",
    resolves: true,
    home_org: "unfoldingWord",
    queried_org: "PBT",
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
    expect(shownTrigger({ kind: "checking-code" })).toBeNull();
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
