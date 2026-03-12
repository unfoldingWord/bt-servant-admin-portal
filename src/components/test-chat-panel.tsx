import { useCallback, useEffect, useRef, useState } from "react";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";
import {
  faPaperPlaneTop,
  faSpinnerThird,
  faXmark,
  faTrashCan,
} from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { cn } from "@/lib/utils";
import { useThemeStore } from "@/lib/theme-store";
import { useUiStore } from "@/lib/ui-store";
import { useTestChat } from "@/hooks/use-test-chat";
import {
  useModes,
  useSetUserMode,
  useClearUserMode,
} from "@/hooks/use-prompt-config";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function TestChatPanel() {
  const testChatOpen = useUiStore((s) => s.testChatOpen);
  const setTestChatOpen = useUiStore((s) => s.setTestChatOpen);
  const chatMode = useUiStore((s) => s.chatMode);
  const setChatMode = useUiStore((s) => s.setChatMode);
  const testChatUserId = useUiStore((s) => s.testChatUserId);
  const theme = useThemeStore((s) => s.theme);
  const modesQuery = useModes();
  const { mutate: setUserModeMutate } = useSetUserMode();
  const { mutate: clearUserModeMutate } = useClearUserMode();

  // Sync the seeded chatMode to the backend on first open
  const syncedRef = useRef(false);
  useEffect(() => {
    if (testChatOpen && !syncedRef.current) {
      syncedRef.current = true;
      const mode = useUiStore.getState().chatMode;
      if (mode) {
        setUserModeMutate({ userId: testChatUserId, mode });
      }
    }
  }, [testChatOpen, testChatUserId, setUserModeMutate]);

  const handleModeChange = useCallback(
    (value: string) => {
      const mode = value === "__org__" ? null : value;
      setChatMode(mode);
      if (mode) {
        setUserModeMutate({ userId: testChatUserId, mode });
      } else {
        clearUserModeMutate(testChatUserId);
      }
    },
    [setChatMode, testChatUserId, setUserModeMutate, clearUserModeMutate]
  );
  const {
    messages,
    isLoading,
    isLoadingHistory,
    isCompleting,
    statusMessage,
    streamingText,
    error,
    sendMessage,
    clearMessages,
    finalizeComplete,
  } = useTestChat(testChatUserId);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0;

  // Stable callback ref for AnimatedText
  const handleAnimationCaughtUp = useCallback(() => {
    finalizeComplete();
  }, [finalizeComplete]);

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText, isLoading]);

  // Restore focus to the input after a response completes
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      inputRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  function doSubmit() {
    if (!input.trim() || isLoading) return;
    void sendMessage(input);
    setInput("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  }

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Header */}
      <div className="border-border/50 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-semibold tracking-tight">
            BT Servant Chat
          </span>
          {modesQuery.data && modesQuery.data.modes.length > 0 && (
            <Select
              value={chatMode ?? "__org__"}
              onValueChange={handleModeChange}
            >
              <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__org__">Org Defaults</SelectItem>
                {modesQuery.data.modes.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.label || m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={clearMessages}
                  aria-label="Clear conversation history"
                  className="text-muted-foreground hover:text-foreground rounded-md transition-colors"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="right-0 left-auto translate-x-0"
              >
                Clear conversation history
              </TooltipContent>
            </Tooltip>
          )}
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
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className={cn(
          "bg-background chat-scrollbar flex-1 overflow-y-auto",
          !hasMessages &&
            !isLoadingHistory &&
            "flex flex-col items-center justify-center"
        )}
      >
        {hasMessages ? (
          <div className="flex flex-col gap-4 p-4">
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
            {isLoading && !streamingText && (
              <ThinkingIndicator status={statusMessage} />
            )}
          </div>
        ) : isLoadingHistory ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="text-muted-foreground size-5 animate-spin"
            />
            <p className="text-muted-foreground text-sm">
              Loading conversation…
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-4">
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
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive shrink-0 border-t px-4 py-2 text-xs">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-border/50 bg-card shrink-0 border-t p-3">
        <form onSubmit={handleSubmit}>
          <div className="bg-background ring-border focus-within:ring-primary/50 flex items-center rounded-lg px-3 ring-1 transition-all">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Test Prompt Configuration"
              className="text-foreground placeholder:text-muted-foreground [field-sizing:content] max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label={isLoading ? "Sending…" : "Send message"}
              className="text-muted-foreground hover:text-foreground ml-2 transition-colors disabled:opacity-30"
            >
              <FontAwesomeIcon
                icon={isLoading ? faSpinnerThird : faPaperPlaneTop}
                className={cn("size-3.5", isLoading && "animate-spin")}
              />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
