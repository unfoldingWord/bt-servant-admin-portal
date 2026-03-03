import { faPaperPlaneTop } from "@fortawesome/pro-light-svg-icons";
import { faXmark } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";

export function TestChatPanel() {
  const setTestChatOpen = useUiStore((s) => s.setTestChatOpen);

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Header */}
      <div className="border-border/50 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-foreground text-sm font-semibold tracking-tight">
          Test Chat
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTestChatOpen(false)}
          aria-label="Close test chat"
          className="text-muted-foreground hover:text-foreground rounded-md transition-colors"
        >
          <FontAwesomeIcon icon={faXmark} className="size-4" />
        </Button>
      </div>

      {/* Messages area */}
      <div className="bg-background flex flex-1 flex-col items-center justify-center gap-3 p-4">
        <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
          <FontAwesomeIcon
            icon={faPaperPlaneTop}
            className="text-muted-foreground size-5"
          />
        </div>
        <p className="text-muted-foreground max-w-[200px] text-center text-sm leading-relaxed">
          Send a message to test your BT Servant configuration.
        </p>
      </div>

      {/* Input */}
      <div className="border-border/50 bg-card shrink-0 border-t p-3">
        <div className="bg-background ring-border focus-within:ring-primary/50 flex h-10 items-center rounded-lg px-3 ring-1 transition-all">
          <span className="text-muted-foreground flex-1 text-sm">
            Type a message...
          </span>
          <FontAwesomeIcon
            icon={faPaperPlaneTop}
            className="text-muted-foreground/50 size-3.5"
          />
        </div>
      </div>
    </div>
  );
}
