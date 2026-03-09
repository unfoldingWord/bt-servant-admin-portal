import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  baruchDeleteHistory,
  baruchEnqueueMessage,
  baruchFetchHistory,
  baruchInitiateConversation,
  baruchPollEvents,
} from "@/lib/baruch-api";
import { useAuthStore } from "@/lib/auth-store";
import type { ChatHistoryEntry, ChatMessage, SSEEvent } from "@/types/chat";

const POLL_INTERVAL_ACTIVE = 600;
const POLL_INTERVAL_IDLE = 1500;
const POLL_TIMEOUT = 120_000;

export function useBaruchChat() {
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsInitiation, setNeedsInitiation] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);

  // Abort polling on unmount
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
    if (!needsInitiation) return;

    const controller = new AbortController();
    setIsInitiating(true);

    baruchInitiateConversation(controller.signal)
      .then(({ response }) => {
        const finalMessage: ChatMessage = {
          id: `initiation-${Date.now()}`,
          role: "assistant",
          content: response,
          createdAt: new Date(),
        };
        pendingCompleteRef.current = { message: finalMessage };
        setNeedsInitiation(false);
        setIsInitiating(false);
        setStreamingText(response);
        setIsCompleting(true);
      })
      .catch((err: unknown) => {
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
    };
  }, [needsInitiation]);

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

  const pollLoop = useCallback(
    async (messageId: string, signal: AbortSignal) => {
      let cursor = "";
      let accumulated = "";
      let lastEventTime = Date.now();
      const startTime = Date.now();

      while (!signal.aborted) {
        // Timeout check
        if (Date.now() - startTime > POLL_TIMEOUT) {
          throw new Error("Response timed out after 2 minutes");
        }

        const response = await baruchPollEvents(messageId, cursor, signal);
        cursor = response.cursor;

        for (const rawEvent of response.events) {
          lastEventTime = Date.now();
          let parsed: SSEEvent;
          try {
            parsed = JSON.parse(rawEvent.data) as SSEEvent;
          } catch (e) {
            console.warn(
              "[useBaruchChat] malformed SSE event data:",
              rawEvent.data,
              e
            );
            continue;
          }

          switch (parsed.type) {
            case "status":
              setStatusMessage(parsed.message);
              break;
            case "progress":
              accumulated += parsed.text;
              setStreamingText(accumulated);
              break;
            case "complete": {
              const finalText =
                parsed.response.responses.join("\n\n") || accumulated;
              return { finalText, hadStreaming: accumulated.length > 0 };
            }
            case "error":
              throw new Error(parsed.error);
            case "tool_use":
              setStatusMessage(`Using tool: ${parsed.tool}`);
              break;
            case "tool_result":
              setStatusMessage(null);
              break;
          }
        }

        if (response.done) {
          return {
            finalText: accumulated,
            hadStreaming: accumulated.length > 0,
          };
        }

        // Adaptive polling: faster when receiving events, slower when idle
        const timeSinceLastEvent = Date.now() - lastEventTime;
        const interval =
          timeSinceLastEvent > 3000 ? POLL_INTERVAL_IDLE : POLL_INTERVAL_ACTIVE;

        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      return { finalText: accumulated, hadStreaming: accumulated.length > 0 };
    },
    []
  );

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
        const { message_id } = await baruchEnqueueMessage(
          trimmed,
          controller.signal
        );

        const { finalText, hadStreaming } = await pollLoop(
          message_id,
          controller.signal
        );

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
          // already playing the accumulated text. Let the animation finish;
          // finalizeComplete will swap in the permanent message once it
          // catches up.
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
    [isLoading, pollLoop]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    pendingCompleteRef.current = null;
    setMessages([]);
    setIsLoading(false);
    setIsCompleting(false);
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

    // streamingText is accumulated mid-stream. useBaruchChat appends a
    // synthetic "streaming" message to allMessages so components don't need
    // to render streamingText directly — they just render allMessages.
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
    isCompleting,
    statusMessage,
    // streamingText is intentionally not returned — consumers render
    // allMessages (which already contains the synthetic streaming entry).
    // It is kept in state only for the useEffect auto-scroll dependency.
    streamingText,
    error,
    sendMessage,
    clearMessages,
    finalizeComplete,
  };
}
