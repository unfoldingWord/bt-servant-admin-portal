import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteHistory,
  deleteMemory,
  fetchHistory,
  streamChat,
} from "@/lib/chat-api";
import { consumeSSEStream } from "@/lib/sse-stream";
import { useUiStore } from "@/lib/ui-store";
import type { ChatHistoryEntry, ChatMessage } from "@/types/chat";

export function useTestChat(userId: string) {
  // Track the editor-tab selections so the next outgoing message carries
  // `#<mode> @<language>` as a per-turn trigger override (#81 + worker #211).
  const selectedMode = useUiStore((s) => s.selectedMode);
  const selectedLanguage = useUiStore((s) => s.selectedLanguage);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

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
        const response = await streamChat(trimmed, userId, {
          mode: selectedMode,
          language: selectedLanguage,
          signal: controller.signal,
        });

        const { finalText } = await consumeSSEStream(response, {
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

        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
        setStatusMessage(null);
        setStreamingText("");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "An error occurred");
        setIsLoading(false);
        setStreamingText("");
        setStatusMessage(null);
      }
    },
    [isLoading, selectedLanguage, selectedMode, userId]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
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
    statusMessage,
    streamingText,
    error,
    sendMessage,
    clearMessages,
  };
}
