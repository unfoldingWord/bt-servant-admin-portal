import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Section } from "@/types/ui";

interface UiState {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
  testChatOpen: boolean;
  setTestChatOpen: (open: boolean) => void;
  toggleTestChat: () => void;
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
    }),
    { name: "bt-servant-ui" }
  )
);
