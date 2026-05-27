import { beforeEach, describe, expect, it } from "vitest";

// The cloudflare workers test pool has no localStorage. The store reads it
// at module load (testChatPanelWidth + showDrafts persistence), so stub
// before the dynamic import or the module will throw.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
  configurable: true,
});

const { useUiStore } = await import("../src/lib/ui-store");

// The store is module-scoped so successive tests share state. Reset before
// each test to keep assertions hermetic.
beforeEach(() => {
  useUiStore.getState().reset();
});

describe("ui-store setContextOrg (#166 PR B)", () => {
  it("defaults contextOrg to null (same-org path)", () => {
    expect(useUiStore.getState().contextOrg).toBe(null);
  });

  it("clears selectedMode + selectedLanguage when switching context", () => {
    // Without the clear, a super admin who picked `spoken` in their home
    // org would see the editor render the home-org `spoken` document
    // briefly when the cross-org query lands. Pin the invariant so a
    // future store refactor can't quietly drop the clear.
    const s = useUiStore.getState();
    s.setSelectedMode("spoken");
    s.setSelectedLanguage("arabic");
    expect(useUiStore.getState().selectedMode).toBe("spoken");
    expect(useUiStore.getState().selectedLanguage).toBe("arabic");

    s.setContextOrg("word-collective");

    expect(useUiStore.getState().contextOrg).toBe("word-collective");
    expect(useUiStore.getState().selectedMode).toBe(null);
    expect(useUiStore.getState().selectedLanguage).toBe(null);
  });

  it("clears selections when going back to same-org (null)", () => {
    const s = useUiStore.getState();
    s.setContextOrg("word-collective");
    s.setSelectedMode("spoken");
    s.setSelectedLanguage("arabic");

    s.setContextOrg(null);

    expect(useUiStore.getState().contextOrg).toBe(null);
    expect(useUiStore.getState().selectedMode).toBe(null);
    expect(useUiStore.getState().selectedLanguage).toBe(null);
  });

  it("no-ops when set to the current value (selections preserved)", () => {
    // Setting the same value is idempotent — don't churn selections just
    // because the selector fired a redundant onValueChange. Mirrors the
    // pattern in `setSelectedMode` etc. which are plain setters.
    const s = useUiStore.getState();
    s.setContextOrg("word-collective");
    s.setSelectedMode("spoken");
    s.setSelectedLanguage("arabic");

    s.setContextOrg("word-collective");

    expect(useUiStore.getState().selectedMode).toBe("spoken");
    expect(useUiStore.getState().selectedLanguage).toBe("arabic");
  });

  it("reset() clears contextOrg back to null (logout path)", () => {
    const s = useUiStore.getState();
    s.setContextOrg("word-collective");
    expect(useUiStore.getState().contextOrg).toBe("word-collective");

    s.reset();

    expect(useUiStore.getState().contextOrg).toBe(null);
  });
});
