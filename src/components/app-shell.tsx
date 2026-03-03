import { Outlet } from "react-router";

import { useUiStore } from "@/lib/ui-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityBar } from "@/components/activity-bar";
import { TestChatPanel } from "@/components/test-chat-panel";

export function AppShell() {
  const { testChatOpen, setTestChatOpen } = useUiStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full overflow-hidden">
        <ActivityBar />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {isDesktop ? (
          testChatOpen && (
            <aside className="h-full w-[340px] shrink-0 shadow-[-4px_0_12px_rgba(0,0,0,0.2)]">
              <TestChatPanel />
            </aside>
          )
        ) : (
          <Sheet open={testChatOpen} onOpenChange={setTestChatOpen}>
            <SheetContent side="right" showCloseButton={false} className="p-0">
              <SheetTitle className="sr-only">Test Chat</SheetTitle>
              <TestChatPanel />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TooltipProvider>
  );
}
