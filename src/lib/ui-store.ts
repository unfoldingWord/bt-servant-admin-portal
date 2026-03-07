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
  chatMode: string | null;
  setChatMode: (mode: string | null) => void;
  testChatUserId: string;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeSection: "baruch",
      setActiveSection: (activeSection) => set({ activeSection }),
      testChatOpen: false,
      setTestChatOpen: (open) =>
        set((state) => ({
          testChatOpen: open,
          // Seed chat mode from config page mode when opening
          ...(open && !state.testChatOpen
            ? { chatMode: state.selectedMode }
            : {}),
        })),
      toggleTestChat: () =>
        set((state) => ({
          testChatOpen: !state.testChatOpen,
          // Seed chat mode from config page mode when opening
          ...(!state.testChatOpen ? { chatMode: state.selectedMode } : {}),
        })),
      selectedMode: null,
      setSelectedMode: (selectedMode) => set({ selectedMode }),
      chatMode: null,
      setChatMode: (chatMode) => set({ chatMode }),
      testChatUserId: crypto.randomUUID(),
    }),
    {
      name: "bt-servant-ui",
      partialize: (state) => ({ testChatOpen: state.testChatOpen }),
    }
  )
);
