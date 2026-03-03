import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";
import { faPaperPlaneTop } from "@fortawesome/pro-light-svg-icons";
import { faXmark } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useThemeStore } from "@/lib/theme-store";
import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";

export function TestChatPanel() {
  const setTestChatOpen = useUiStore((s) => s.setTestChatOpen);
  const theme = useThemeStore((s) => s.theme);

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Header */}
      <div className="border-border/50 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-foreground text-sm font-semibold tracking-tight">
          BT Servant Chat
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
        <span
          className="text-4xl"
          style={
            {
              "--fa-primary-color":
                theme === "dark" ? "oklch(0.9 0 0)" : "oklch(1 0 0)",
              "--fa-primary-opacity": "1",
              "--fa-secondary-color":
                theme === "dark"
                  ? "oklch(0.541 0.168 248)"
                  : "oklch(0.475 0.157 248)",
              "--fa-secondary-opacity": "1",
            } as React.CSSProperties
          }
        >
          <FontAwesomeIcon icon={faBookBible} />
        </span>
        <p className="text-muted-foreground max-w-[200px] text-center text-sm leading-relaxed">
          Send a message to test your BT Servant configuration.
        </p>
      </div>

      {/* Input */}
      <div className="border-border/50 bg-card shrink-0 border-t p-3">
        <div className="bg-background ring-border focus-within:ring-primary/50 flex h-10 items-center rounded-lg px-3 ring-1 transition-all">
          <span className="text-muted-foreground flex-1 text-sm">
            Chat with BT Servant…
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
