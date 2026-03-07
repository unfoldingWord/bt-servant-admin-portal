import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteHistory,
  enqueueMessage,
  fetchHistory,
  pollEvents,
} from "@/lib/chat-api";
import { useUiStore } from "@/lib/ui-store";
import type { ChatHistoryEntry, ChatMessage, SSEEvent } from "@/types/chat";

const POLL_INTERVAL_ACTIVE = 600;
const POLL_INTERVAL_IDLE = 1500;
const POLL_TIMEOUT = 120_000;

export function useTestChat() {
  const testChatUserId = useUiStore((s) => s.testChatUserId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);

  // Abort polling on unmount
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

    fetchHistory(testChatUserId, 50, 0, controller.signal)
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
  }, [testChatUserId]);

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

        const response = await pollEvents(
          messageId,
          cursor,
          testChatUserId,
          signal
        );
        cursor = response.cursor;

        for (const rawEvent of response.events) {
          lastEventTime = Date.now();
          let parsed: SSEEvent;
          try {
            parsed = JSON.parse(rawEvent.data) as SSEEvent;
          } catch (e) {
            console.warn(
              "[useTestChat] malformed SSE event data:",
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
    [testChatUserId]
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
        const { message_id } = await enqueueMessage(
          trimmed,
          testChatUserId,
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
    [isLoading, pollLoop, testChatUserId]
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

    deleteHistory(testChatUserId).catch((err) => {
      console.warn("[useTestChat] Failed to delete server history:", err);
      setError("Failed to clear server history. It may reappear on reload.");
    });
  }, [testChatUserId]);

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
