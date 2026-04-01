import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteHistory,
  deleteMemory,
  fetchHistory,
  streamChat,
} from "@/lib/chat-api";
import { consumeSSEStream } from "@/lib/sse-stream";
import type { ChatHistoryEntry, ChatMessage } from "@/types/chat";

export function useTestChat(userId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load conversation history on mount.
  // No ref gate — the AbortController cleanup handles StrictMode's
  // double-invocation: the first fetch is aborted, the second succeeds.
  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingHistory(true);

    fetchHistory(userId, 50, 0, controller.signal)
      .then((data) => {
        const historyMessages: ChatMessage[] = [];
        data.entries.forEach((entry: ChatHistoryEntry, i: number) => {
          const timestamp = entry.created_at
            ? new Date(entry.created_at)
            : new Date(entry.timestamp);

          historyMessages.push({
            id: `history-user-${i}`,
            role: "user",
            content: entry.user_message,
            createdAt: timestamp,
          });
          historyMessages.push({
            id: `history-assistant-${i}`,
            role: "assistant",
            content: entry.assistant_response,
            createdAt: timestamp,
          });
        });
        setMessages((prev) =>
          prev.length > 0 ? [...historyMessages, ...prev] : historyMessages
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[useTestChat] Failed to load history:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [userId]);

  // Called by the component when AnimatedText finishes catching up
  const finalizeComplete = useCallback(() => {
    const pending = pendingCompleteRef.current;
    if (!pending) return;

    pendingCompleteRef.current = null;
    // React 18+ auto-batches these into a single render
    setIsCompleting(false);
    setIsLoading(false);
    setStatusMessage(null);
    setMessages((prev) => [...prev, pending.message]);
    setStreamingText("");
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Abort any previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);
      setStreamingText("");
      setStatusMessage(null);

      try {
        const response = await streamChat(trimmed, userId, controller.signal);

        const { finalText, hadStreaming } = await consumeSSEStream(response, {
          onStatus: (msg) => setStatusMessage(msg),
          onProgress: (_text, acc) => setStreamingText(acc),
          onToolUse: (tool) => setStatusMessage(`Using tool: ${tool}`),
          onToolResult: () => setStatusMessage(null),
        });

        if (!finalText) return;

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: finalText,
          createdAt: new Date(),
        };

        if (!hadStreaming) {
          setMessages((prev) => [...prev, assistantMessage]);
          setIsLoading(false);
          setStatusMessage(null);
          setStreamingText("");
        } else {
          pendingCompleteRef.current = { message: assistantMessage };
          // Don't call setStreamingText(finalText) here — the animation is
          // already playing the accumulated text.  Feeding a different string
          // (responses.join) causes useAnimatedText to detect a divergence and
          // reset the animation from the beginning.  Instead, let the animation
          // finish with what it has; finalizeComplete will swap in the permanent
          // message (which carries the canonical finalText) once it catches up.
          setIsCompleting(true);
          setStatusMessage(null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "An error occurred");
        setIsLoading(false);
        setStreamingText("");
        setStatusMessage(null);
      }
    },
    [isLoading, userId]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    pendingCompleteRef.current = null;
    setMessages([]);
    setIsLoading(false);
    setIsCompleting(false);
    setStreamingText("");
    setStatusMessage(null);
    setError(null);

    Promise.allSettled([deleteHistory(userId), deleteMemory(userId)]).then(
      (results) => {
        const failures = results
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => (r.reason as Error).message);
        if (failures.length > 0) {
          console.warn("[useTestChat] Failed to clear server data:", failures);
          setError("Failed to clear server data. It may reappear on reload.");
        }
      }
    );
  }, [userId]);

  const streamingCreatedAt = useRef(new Date());

  const allMessages = useMemo(() => {
    if (!streamingText) return messages;

    const streamingMessage: ChatMessage = {
      id: "streaming",
      role: "assistant",
      content: streamingText,
      createdAt: streamingCreatedAt.current,
      isStreaming: true,
    };
    return [...messages, streamingMessage];
  }, [messages, streamingText]);

  return {
    messages: allMessages,
    isLoading,
    isLoadingHistory,
    isCompleting,
    statusMessage,
    streamingText,
    error,
    sendMessage,
    clearMessages,
    finalizeComplete,
  };
}
