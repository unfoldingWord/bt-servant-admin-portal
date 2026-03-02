import { faXmark } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TestChatPanel() {
  const setTestChatOpen = useUiStore((s) => s.setTestChatOpen);

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Test Chat
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTestChatOpen(false)}
          aria-label="Close test chat"
          className="text-muted-foreground hover:text-foreground"
        >
          <FontAwesomeIcon icon={faXmark} className="size-3.5" />
        </Button>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-3">
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Send a message to test your Baruch configuration.
          </p>
        </div>
      </ScrollArea>

      {/* Input stub */}
      <div className="shrink-0 border-t p-3">
        <div className="bg-input/30 flex h-9 items-center rounded-md border px-3">
          <span className="text-muted-foreground text-sm">
            Type a message...
          </span>
        </div>
      </div>
    </div>
  );
}
