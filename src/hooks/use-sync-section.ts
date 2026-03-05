import { useEffect } from "react";
import { useLocation } from "react-router";

import { useUiStore } from "@/lib/ui-store";
import type { Section } from "@/types/ui";

const pathToSection: Record<string, Section> = {
  "/": "baruch",
  "/prompt-configuration": "prompt-configuration",
};

export function useSyncSection() {
  const { pathname } = useLocation();
  const setActiveSection = useUiStore((s) => s.setActiveSection);

  useEffect(() => {
    const section = pathToSection[pathname];
    if (section) {
      setActiveSection(section);
    }
  }, [pathname, setActiveSection]);
}
