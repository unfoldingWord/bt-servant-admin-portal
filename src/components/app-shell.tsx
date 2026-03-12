import { useCallback, useRef } from "react";
import { Outlet } from "react-router";

import { cn } from "@/lib/utils";
import { useUiStore, CHAT_PANEL_MIN_WIDTH, CHAT_PANEL_MAX_WIDTH } from "@/lib/ui-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useResizeHandle } from "@/hooks/use-resize-handle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityBar } from "@/components/activity-bar";
import { TestChatPanel } from "@/components/test-chat-panel";

export function AppShell() {
  const {
    testChatOpen,
    setTestChatOpen,
    testChatPanelWidth,
    setTestChatPanelWidth,
    persistTestChatPanelWidth,
  } = useUiStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { handleMouseDown, isResizing } = useResizeHandle({
    onResize: setTestChatPanelWidth,
    onCommit: persistTestChatPanelWidth,
    currentWidth: testChatPanelWidth,
    minWidth: CHAT_PANEL_MIN_WIDTH,
    maxWidth: CHAT_PANEL_MAX_WIDTH,
  });

  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const debouncedPersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistTestChatPanelWidth, 300);
  }, [persistTestChatPanelWidth]);

  function handleResizeKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === "ArrowLeft") {
      setTestChatPanelWidth(testChatPanelWidth + step);
      debouncedPersist();
    } else if (e.key === "ArrowRight") {
      setTestChatPanelWidth(testChatPanelWidth - step);
      debouncedPersist();
    }
  }

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
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat panel"
              aria-valuenow={testChatPanelWidth}
              aria-valuemin={CHAT_PANEL_MIN_WIDTH}
              aria-valuemax={CHAT_PANEL_MAX_WIDTH}
              tabIndex={0}
              onMouseDown={handleMouseDown}
              onKeyDown={handleResizeKeyDown}
              className={cn(
                "absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors focus:outline-none focus-visible:bg-primary/50",
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
