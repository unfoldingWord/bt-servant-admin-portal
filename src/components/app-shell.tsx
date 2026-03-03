import { useEffect, useRef } from "react";
import { Outlet } from "react-router";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { useUiStore } from "@/lib/ui-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityBar } from "@/components/activity-bar";
import { TestChatPanel } from "@/components/test-chat-panel";

export function AppShell() {
  const { testChatOpen, setTestChatOpen } = useUiStore();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const chatPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    if (testChatOpen) {
      chatPanelRef.current?.expand();
    } else {
      chatPanelRef.current?.collapse();
    }
  }, [testChatOpen]);

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        <ActivityBar />

        {isDesktop ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-w-0 flex-1"
          >
            <ResizablePanel defaultSize={testChatOpen ? 65 : 100} minSize={40}>
              <ScrollArea className="h-full">
                <Outlet />
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle />
            <ResizablePanel
              panelRef={chatPanelRef}
              defaultSize={testChatOpen ? 35 : 0}
              minSize={20}
              maxSize={50}
              collapsible
              collapsedSize={0}
              className="overflow-hidden"
            >
              <TestChatPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            <ScrollArea className="h-full min-w-0 flex-1">
              <Outlet />
            </ScrollArea>

            <Sheet open={testChatOpen} onOpenChange={setTestChatOpen}>
              <SheetContent
                side="right"
                showCloseButton={false}
                className="p-0"
              >
                <SheetTitle className="sr-only">Test Chat</SheetTitle>
                <TestChatPanel />
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
