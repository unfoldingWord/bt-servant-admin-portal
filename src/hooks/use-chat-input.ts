import { useCallback, useEffect, useRef, useState } from "react";

interface UseChatInputArgs {
  onSubmit: (text: string) => void;
  isBusy: boolean;
}

export function useChatInput({ onSubmit, isBusy }: UseChatInputArgs) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore focus when a response completes (busy → idle transition).
  const prevBusyRef = useRef(false);
  useEffect(() => {
    if (prevBusyRef.current && !isBusy) {
      inputRef.current?.focus();
    }
    prevBusyRef.current = isBusy;
  }, [isBusy]);

  const submit = useCallback(() => {
    if (!input.trim() || isBusy) return;
    onSubmit(input);
    setInput("");
  }, [input, isBusy, onSubmit]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submit();
    },
    [submit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  return { input, setInput, inputRef, handleSubmit, handleKeyDown };
}
