import { Outlet } from "react-router";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/ui-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useResizeHandle } from "@/hooks/use-resize-handle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityBar } from "@/components/activity-bar";
import { TestChatPanel } from "@/components/test-chat-panel";

export function AppShell() {
  const { testChatOpen, setTestChatOpen, testChatPanelWidth, setTestChatPanelWidth } = useUiStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { handleMouseDown, isResizing } = useResizeHandle({
    onResize: setTestChatPanelWidth,
    currentWidth: testChatPanelWidth,
    minWidth: 280,
    maxWidth: 800,
  });

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        <ActivityBar />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {isDesktop ? (
          <aside
            className={cn(
              "relative h-full shrink-0 shadow-[-4px_0_12px_rgba(0,0,0,0.2)]",
              !testChatOpen && "hidden"
            )}
            style={{ width: testChatPanelWidth }}
          >
            <div
              onMouseDown={handleMouseDown}
              className={cn(
                "absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors",
                isResizing ? "bg-primary" : "hover:bg-border"
              )}
            />
            <TestChatPanel />
          </aside>
        ) : (
          <Sheet open={testChatOpen} onOpenChange={setTestChatOpen}>
            <SheetContent side="right" showCloseButton={false} className="p-0">
              <SheetTitle className="sr-only">BT Servant Chat</SheetTitle>
              <TestChatPanel />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TooltipProvider>
  );
}
