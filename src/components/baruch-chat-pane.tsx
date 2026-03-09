import { useCallback, useEffect, useRef, useState } from "react";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";
import {
  faPaperPlaneTop,
  faSpinnerThird,
  faTrashCan,
} from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { cn } from "@/lib/utils";
import { useThemeStore } from "@/lib/theme-store";
import { useBaruchChat } from "@/hooks/use-baruch-chat";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UserMessage,
  AssistantMessage,
  ThinkingIndicator,
} from "@/components/chat-message";

export function BaruchChatPane() {
  const theme = useThemeStore((s) => s.theme);

  const {
    messages,
    isLoading,
    isLoadingHistory,
    isInitiating,
    isCompleting,
    statusMessage,
    // streamingText is used only for auto-scroll — the hook embeds the
    // in-flight text into allMessages as a synthetic streaming entry so
    // components render a single list without special-casing the stream.
    streamingText,
    error,
    sendMessage,
    clearMessages,
    finalizeComplete,
  } = useBaruchChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const isBusy = isLoading || isInitiating;

  const handleAnimationCaughtUp = useCallback(() => {
    finalizeComplete();
  }, [finalizeComplete]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText, isLoading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    void sendMessage(input);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className={cn(
          "chat-scrollbar flex-1 overflow-y-auto",
          !hasMessages &&
            !isLoadingHistory &&
            !isInitiating &&
            "flex flex-col items-center justify-center"
        )}
      >
        {hasMessages || isInitiating ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-2 py-6">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <UserMessage key={msg.id} message={msg} />
              ) : (
                <AssistantMessage
                  key={msg.id}
                  message={msg}
                  isCompleting={isCompleting}
                  onAnimationCaughtUp={handleAnimationCaughtUp}
                />
              )
            )}
            {isInitiating && (
              <ThinkingIndicator status="Starting conversation…" />
            )}
            {isLoading && !streamingText && (
              <ThinkingIndicator status={statusMessage} />
            )}
          </div>
        ) : isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="text-muted-foreground size-5 animate-spin"
            />
            <p className="text-muted-foreground text-sm">
              Loading conversation…
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 p-8">
            <span
              className="text-5xl"
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
            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-foreground text-lg font-semibold tracking-tight">
                Talk to Baruch
              </h2>
              <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                Configure your BT Servant agent — name, identity, teaching
                methodology, tool guidance, instructions, memory, and closing
                prompt.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive shrink-0 border-t px-4 py-2 text-xs">
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="border-border/50 bg-background shrink-0 border-t px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-2xl items-center gap-2"
        >
          <div className="bg-card ring-border focus-within:ring-primary/50 flex flex-1 items-center rounded-xl px-4 py-2.5 ring-1 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Baruch…"
              disabled={isBusy}
              className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              aria-label={isBusy ? "Sending…" : "Send message"}
              className="text-muted-foreground hover:text-foreground ml-3 transition-colors disabled:opacity-30"
            >
              <FontAwesomeIcon
                icon={isLoading ? faSpinnerThird : faPaperPlaneTop}
                className={cn("size-4", isBusy && "animate-spin")}
              />
            </button>
          </div>
          {hasMessages && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  aria-label="Clear conversation history"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Clear conversation</TooltipContent>
            </Tooltip>
          )}
        </form>
      </div>
    </div>
  );
}
