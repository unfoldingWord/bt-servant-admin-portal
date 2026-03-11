import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useAnimatedText } from "@/hooks/use-animated-text";
import type { ChatMessage } from "@/types/chat";

/**
 * Unicode superscript digits → regular digits mapping.
 * Used to normalize verse numbers like ¹⁸ into <sup>18</sup> so they
 * render at a uniform height instead of the staircase effect caused by
 * some fonts rendering adjacent unicode superscripts at different levels.
 */
const SUPER_DIGIT_MAP: Record<string, string> = {
  "\u2070": "0",
  "\u00B9": "1",
  "\u00B2": "2",
  "\u00B3": "3",
  "\u2074": "4",
  "\u2075": "5",
  "\u2076": "6",
  "\u2077": "7",
  "\u2078": "8",
  "\u2079": "9",
};
const SUPER_DIGIT_TEST = /[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/;

function normalizeSupDigit(match: string): string {
  return Array.from(match)
    .map((ch) => SUPER_DIGIT_MAP[ch] ?? ch)
    .join("");
}

/** Split a string into text segments and <sup> elements for verse numbers. */
function renderNormalizedText(text: string): React.ReactNode {
  if (!SUPER_DIGIT_TEST.test(text)) return text;

  const re = /[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <sup key={match.index} className="text-[0.75em] align-super">
        {normalizeSupDigit(match[0])}
      </sup>
    );
    lastIndex = SUPER_DIGIT_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Recursively walk React children, normalizing text nodes. */
function normalizeChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return renderNormalizedText(children);
  if (Array.isArray(children)) return children.map(normalizeChildren);
  return children;
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{normalizeChildren(children)}</p>
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

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full justify-end">
      <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-base leading-relaxed">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function AnimatedText({
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

export function AssistantMessage({
  message,
  isCompleting,
  onAnimationCaughtUp,
}: {
  message: ChatMessage;
  isCompleting: boolean;
  onAnimationCaughtUp: () => void;
}) {
  return (
    <div className="text-foreground pl-1 text-base leading-relaxed">
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

export function ThinkingIndicator({ status }: { status: string | null }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 pl-1 text-base">
      <FontAwesomeIcon icon={faSpinnerThird} className="size-3 animate-spin" />
      <span>{status || "Thinking…"}</span>
    </div>
  );
}
