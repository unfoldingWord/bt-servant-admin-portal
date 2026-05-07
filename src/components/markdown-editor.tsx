import { useEffect, useMemo, type RefObject } from "react";

import { cn } from "@/lib/utils";
import { parseHeadings } from "@/lib/markdown-headings";
import { useDebounced } from "@/hooks/use-debounced";
import { Textarea } from "@/components/ui/textarea";
import type { MarkdownHeading } from "@/types/markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onHeadingsChange?: (headings: MarkdownHeading[]) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  spellCheck?: boolean;
  readOnly?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  onHeadingsChange,
  textareaRef,
  className,
  spellCheck = false,
  readOnly = false,
}: MarkdownEditorProps) {
  const debounced = useDebounced(value, 150);
  const headings = useMemo(() => parseHeadings(debounced), [debounced]);

  useEffect(() => {
    onHeadingsChange?.(headings);
  }, [headings, onHeadingsChange]);

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={spellCheck}
      readOnly={readOnly}
      className={cn(
        "[field-sizing:fixed] h-full w-full resize-none rounded-none border-0 px-12 py-10 font-mono text-[13px] leading-[1.7] tracking-[-0.005em] shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      style={{
        background: "var(--editor-paper)",
        color: "var(--editor-ink)",
      }}
    />
  );
}
