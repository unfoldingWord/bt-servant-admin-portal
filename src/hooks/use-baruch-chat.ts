import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  baruchDeleteHistory,
  baruchFetchHistory,
  baruchInitiateConversation,
  streamBaruchChat,
} from "@/lib/baruch-api";
import { useAuthStore } from "@/lib/auth-store";
import { consumeSSEStream } from "@/lib/sse-stream";
import type { ChatHistoryEntry, ChatMessage } from "@/types/chat";

export function useBaruchChat() {
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsInitiation, setNeedsInitiation] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const initiatingRef = useRef(false);

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load conversation history on mount (or when userId becomes available).
  // No ref gate — the AbortController cleanup handles StrictMode's
  // double-invocation: the first fetch is aborted, the second succeeds.
  useEffect(() => {
    // Guard: skip API call until auth has resolved and we have a real userId
    if (!userId) {
      setIsLoadingHistory(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingHistory(true);

    baruchFetchHistory(50, 0, controller.signal)
      .then((data) => {
        const historyMessages: ChatMessage[] = [];
        data.entries.forEach((entry: ChatHistoryEntry, i: number) => {
          const timestamp = entry.created_at
            ? new Date(entry.created_at)
            : new Date(entry.timestamp);

          if (entry.user_message) {
            historyMessages.push({
              id: `history-user-${i}`,
              role: "user",
              content: entry.user_message,
              createdAt: timestamp,
            });
          }
          historyMessages.push({
            id: `history-assistant-${i}`,
            role: "assistant",
            content: entry.assistant_response,
            createdAt: timestamp,
          });
        });
        if (historyMessages.length === 0) {
          setNeedsInitiation(true);
        }
        setMessages((prev) =>
          prev.length > 0 ? [...historyMessages, ...prev] : historyMessages
        );
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[useBaruchChat] Failed to load history:", err);
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

  // Initiate conversation when history is empty
  useEffect(() => {
    if (!needsInitiation || initiatingRef.current) return;

    initiatingRef.current = true;
    const controller = new AbortController();
    setIsInitiating(true);

    async function runInitiation() {
      const res = await baruchInitiateConversation(controller.signal);

      const { finalText } = await consumeSSEStream(res, {
        onProgress: (_text, acc) => setStreamingText(acc),
      });

      const finalMessage: ChatMessage = {
        id: `initiation-${Date.now()}`,
        role: "assistant",
        content: finalText,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, finalMessage]);
      setStreamingText("");
      setNeedsInitiation(false);
      setIsInitiating(false);
      initiatingRef.current = false;
    }

    runInitiation().catch((err: unknown) => {
      initiatingRef.current = false;
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[useBaruchChat] Failed to initiate conversation:", err);
      setNeedsInitiation(false);
      setIsInitiating(false);
      setError(
        err instanceof Error ? err.message : "Failed to start conversation"
      );
    });

    return () => {
      controller.abort();
      initiatingRef.current = false;
    };
  }, [needsInitiation]);

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
        const response = await streamBaruchChat(trimmed, controller.signal);

        const { finalText } = await consumeSSEStream(response, {
          onStatus: (msg) => setStatusMessage(msg),
          onProgress: (_text, acc) => setStreamingText(acc),
          onToolUse: (tool) => setStatusMessage(`Using tool: ${tool}`),
          onToolResult: () => setStatusMessage(null),
        });

        if (!finalText) {
          setIsLoading(false);
          setStreamingText("");
          setStatusMessage(null);
          return;
        }

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
    [isLoading]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    initiatingRef.current = false;
    setMessages([]);
    setIsLoading(false);
    setIsInitiating(false);
    setStreamingText("");
    setStatusMessage(null);
    setError(null);

    setNeedsInitiation(true);
    baruchDeleteHistory().catch((err) => {
      console.warn("[useBaruchChat] Failed to delete server history:", err);
      setError("Failed to clear server history. It may reappear on reload.");
    });
  }, []);

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
    isInitiating,
    statusMessage,
    streamingText,
    error,
    sendMessage,
    clearMessages,
  };
}
