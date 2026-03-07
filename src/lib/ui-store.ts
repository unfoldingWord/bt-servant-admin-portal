import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Section } from "@/types/ui";

interface UiState {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  testChatOpen: boolean;
  setTestChatOpen: (open: boolean) => void;
  toggleTestChat: () => void;
  selectedMode: string | null;
  setSelectedMode: (mode: string | null) => void;
  testChatUserId: string;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeSection: "baruch",
      setActiveSection: (activeSection) => set({ activeSection }),
      testChatOpen: false,
      setTestChatOpen: (testChatOpen) => set({ testChatOpen }),
      toggleTestChat: () =>
        set((state) => ({ testChatOpen: !state.testChatOpen })),
      selectedMode: null,
      setSelectedMode: (selectedMode) => set({ selectedMode }),
      testChatUserId: crypto.randomUUID(),
    }),
    {
      name: "bt-servant-ui",
      partialize: (state) => ({ testChatOpen: state.testChatOpen }),
    }
  )
);
