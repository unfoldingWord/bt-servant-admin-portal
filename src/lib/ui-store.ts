import { create } from "zustand";

import type { Section } from "@/types/ui";

export const CHAT_PANEL_MIN_WIDTH = 280;
export const CHAT_PANEL_MAX_WIDTH = 800;
export const CHAT_PANEL_DEFAULT_WIDTH = 340;

interface UiState {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  testChatOpen: boolean;
  setTestChatOpen: (open: boolean) => void;
  toggleTestChat: () => void;
  selectedMode: string | null;
  setSelectedMode: (mode: string | null) => void;
  selectedLanguage: string | null;
  setSelectedLanguage: (language: string | null) => void;
  // Super-admin cross-org override for /api/config/* fetches. `null` is the
  // everyday same-org path: hooks omit the `?org=` param and the worker
  // resolves the caller's session.org. When set to a non-null slug, the
  // Modes / Languages / Prompt-Overrides pages operate on that org instead
  // (worker gates on isSuperAdmin per #166 PR A). `setContextOrg` clears
  // selectedMode + selectedLanguage so org-A state doesn't bleed into
  // org-B fetches — otherwise the per-mode draft would briefly display
  // stale content from the previous context.
  contextOrg: string | null;
  setContextOrg: (org: string | null) => void;
  chatMode: string | null;
  chatModeSeeded: boolean;
  setChatMode: (mode: string | null) => void;
  testChatUserId: string;
  testChatPanelWidth: number;
  setTestChatPanelWidth: (width: number) => void;
  persistTestChatPanelWidth: () => void;
  showDrafts: boolean;
  setShowDrafts: (showDrafts: boolean) => void;
  reset: () => void;
}

// Explicit Pick ensures initialState stays in sync with UiState as fields are added.
// Note: testChatUserId is included but treated as a placeholder — reset() always
// generates a fresh UUID so sessions are isolated; the value here seeds the very
// first session before any logout occurs.
type InitialUiState = Pick<
  UiState,
  | "activeSection"
  | "testChatOpen"
  | "selectedMode"
  | "selectedLanguage"
  | "contextOrg"
  | "chatMode"
  | "chatModeSeeded"
  | "testChatUserId"
  | "testChatPanelWidth"
  | "showDrafts"
>;

function loadPersistedShowDrafts(): boolean {
  const stored = localStorage.getItem("showDrafts");
  if (stored === "false") return false;
  return true;
}

function loadPersistedWidth(): number {
  const stored = localStorage.getItem("testChatPanelWidth");
  if (stored) {
    const parsed = Number(stored);
    if (
      !Number.isNaN(parsed) &&
      parsed >= CHAT_PANEL_MIN_WIDTH &&
      parsed <= CHAT_PANEL_MAX_WIDTH
    )
      return parsed;
  }
  return CHAT_PANEL_DEFAULT_WIDTH;
}

const initialState: InitialUiState = {
  activeSection: "baruch",
  testChatOpen: false,
  selectedMode: null,
  selectedLanguage: null,
  contextOrg: null,
  chatMode: null,
  chatModeSeeded: false,
  // Placeholder — reset() always generates a fresh UUID; this value is only
  // used for the very first session (before any logout occurs).
  testChatUserId: crypto.randomUUID(),
  testChatPanelWidth: loadPersistedWidth(),
  showDrafts: loadPersistedShowDrafts(),
};

export const useUiStore = create<UiState>()((set) => ({
  ...initialState,
  setActiveSection: (activeSection) => set({ activeSection }),
  setTestChatOpen: (open) =>
    set((state) => ({
      testChatOpen: open,
      // Seed chat mode from config page mode only on first open
      ...(open && !state.testChatOpen && !state.chatModeSeeded
        ? { chatMode: state.selectedMode, chatModeSeeded: true }
        : {}),
    })),
  toggleTestChat: () =>
    set((state) => ({
      testChatOpen: !state.testChatOpen,
      // Seed chat mode from config page mode only on first open
      ...(!state.testChatOpen && !state.chatModeSeeded
        ? { chatMode: state.selectedMode, chatModeSeeded: true }
        : {}),
    })),
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  setSelectedLanguage: (selectedLanguage) => set({ selectedLanguage }),
  // Changing context clears selectedMode/selectedLanguage. Without this, a
  // user who selected `spoken` while in their home org would see the
  // freshly-fetched cross-org `spoken` (if any) display under the same
  // selection — the editor would briefly show org-A document content while
  // the cross-org query was in flight, then snap to org-B content. Better
  // to land on the empty-selection state and let the user re-pick.
  setContextOrg: (contextOrg) =>
    set((state) =>
      state.contextOrg === contextOrg
        ? state
        : { contextOrg, selectedMode: null, selectedLanguage: null }
    ),
  setChatMode: (chatMode) => set({ chatMode }),
  setTestChatPanelWidth: (width) => {
    const clamped = Math.max(
      CHAT_PANEL_MIN_WIDTH,
      Math.min(CHAT_PANEL_MAX_WIDTH, width)
    );
    set({ testChatPanelWidth: clamped });
  },
  persistTestChatPanelWidth: () => {
    const { testChatPanelWidth } = useUiStore.getState();
    localStorage.setItem("testChatPanelWidth", String(testChatPanelWidth));
  },
  setShowDrafts: (showDrafts) => {
    localStorage.setItem("showDrafts", String(showDrafts));
    set({ showDrafts });
  },
  // Resets all session-scoped UI state and generates a new testChatUserId so
  // the next user's chat session is fully isolated from the previous one.
  // testChatPanelWidth is intentionally preserved — it's a UI preference, not
  // session state.
  reset: () =>
    set((state) => ({
      ...initialState,
      testChatUserId: crypto.randomUUID(),
      testChatPanelWidth: state.testChatPanelWidth,
      showDrafts: state.showDrafts,
    })),
}));
