import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { useAnimatedText } from "@/hooks/use-animated-text";
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
import type { ChatMessage } from "@/types/chat";

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string;
    children?: React.ReactNode;
  }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="bg-muted my-2 overflow-x-auto rounded-lg p-3 text-xs">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code className="bg-muted rounded px-1 py-0.5 text-xs" {...props}>
        {children}
      </code>
    );
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full justify-end">
      <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-relaxed">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function AnimatedText({
  text,
  isCompleting,
  onAnimationCaughtUp,
}: {
  text: string;
  isCompleting: boolean;
  onAnimationCaughtUp: () => void;
}) {
  const [displayedText, isAnimationDone] = useAnimatedText(text);
  const calledRef = useRef(false);

  // Reset the guard when isCompleting flips to true (new completion cycle)
  const prevCompletingRef = useRef(false);
  if (isCompleting && !prevCompletingRef.current) {
    calledRef.current = false;
  }
  prevCompletingRef.current = isCompleting;

  useEffect(() => {
    if (isCompleting && isAnimationDone && !calledRef.current) {
      calledRef.current = true;
      onAnimationCaughtUp();
    }
  }, [isCompleting, isAnimationDone, onAnimationCaughtUp]);

  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {displayedText}
    </Markdown>
  );
}

function AssistantMessage({
  message,
  isCompleting,
  onAnimationCaughtUp,
}: {
  message: ChatMessage;
  isCompleting: boolean;
  onAnimationCaughtUp: () => void;
}) {
  return (
    <div className="text-foreground pl-1 text-sm leading-relaxed">
      {message.isStreaming ? (
        <>
          <AnimatedText
            text={message.content}
            isCompleting={isCompleting}
            onAnimationCaughtUp={onAnimationCaughtUp}
          />
          <span className="bg-foreground/80 ml-0.5 inline-block h-3.5 w-[2px] animate-pulse" />
        </>
      ) : (
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </Markdown>
      )}
    </div>
  );
}

function ThinkingIndicator({ status }: { status: string | null }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 pl-1 text-sm">
      <FontAwesomeIcon icon={faSpinnerThird} className="size-3 animate-spin" />
      <span>{status || "Thinking…"}</span>
    </div>
  );
}

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

  // Sync the seeded chatMode to the backend when the panel opens
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (testChatOpen && !prevOpenRef.current) {
      const mode = useUiStore.getState().chatMode;
      if (mode) {
        setUserModeMutate({ userId: testChatUserId, mode });
      }
    }
    prevOpenRef.current = testChatOpen;
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
  } = useTestChat();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    void sendMessage(input);
    setInput("");
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
          <div className="bg-background ring-border focus-within:ring-primary/50 flex h-10 items-center rounded-lg px-3 ring-1 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Test Prompt Configuration"
              disabled={isLoading}
              className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
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
