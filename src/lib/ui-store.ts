import { create } from "zustand";

import type { Section } from "@/types/ui";

interface UiState {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  testChatOpen: boolean;
  setTestChatOpen: (open: boolean) => void;
  toggleTestChat: () => void;
  selectedMode: string | null;
  setSelectedMode: (mode: string | null) => void;
  chatMode: string | null;
  chatModeSeeded: boolean;
  setChatMode: (mode: string | null) => void;
  testChatUserId: string;
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
  | "chatMode"
  | "chatModeSeeded"
  | "testChatUserId"
>;

const initialState: InitialUiState = {
  activeSection: "baruch",
  testChatOpen: false,
  selectedMode: null,
  chatMode: null,
  chatModeSeeded: false,
  // Placeholder — reset() always generates a fresh UUID; this value is only
  // used for the very first session (before any logout occurs).
  testChatUserId: crypto.randomUUID(),
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
  setChatMode: (chatMode) => set({ chatMode }),
  // Resets all session-scoped UI state and generates a new testChatUserId so
  // the next user's chat session is fully isolated from the previous one.
  reset: () => set({ ...initialState, testChatUserId: crypto.randomUUID() }),
}));
