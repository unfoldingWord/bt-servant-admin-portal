import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { enqueueMessage, pollEvents } from "@/lib/chat-api";
import type { ChatMessage, SSEEvent } from "@/types/chat";

const POLL_INTERVAL_ACTIVE = 600;
const POLL_INTERVAL_IDLE = 1500;
const POLL_TIMEOUT = 120_000;

export function useTestChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

        const response = await pollEvents(messageId, cursor, signal);
        cursor = response.cursor;

        for (const rawEvent of response.events) {
          lastEventTime = Date.now();
          let parsed: SSEEvent;
          try {
            parsed = JSON.parse(rawEvent.data) as SSEEvent;
          } catch {
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
        const { message_id } = await enqueueMessage(trimmed, controller.signal);

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
    [isLoading, pollLoop]
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
  }, []);

  const allMessages = useMemo(() => {
    if (!streamingText) return messages;

    const streamingMessage: ChatMessage = {
      id: "streaming",
      role: "assistant",
      content: streamingText,
      createdAt: new Date(),
      isStreaming: true,
    };
    return [...messages, streamingMessage];
  }, [messages, streamingText]);

  return {
    messages: allMessages,
    isLoading,
    isCompleting,
    statusMessage,
    streamingText,
    error,
    sendMessage,
    clearMessages,
    finalizeComplete,
  };
}
