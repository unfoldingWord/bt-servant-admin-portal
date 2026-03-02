import { Outlet } from "react-router";

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

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <ActivityBar />

        {isDesktop ? (
          <ResizablePanelGroup orientation="horizontal" className="flex-1">
            <ResizablePanel defaultSize={65} minSize={40}>
              <ScrollArea className="h-full">
                <Outlet />
              </ScrollArea>
            </ResizablePanel>

            {testChatOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
                  <TestChatPanel />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <>
            <ScrollArea className="h-full flex-1">
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
