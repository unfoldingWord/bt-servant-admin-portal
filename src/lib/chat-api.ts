import type { ChatHistoryResponse } from "@/types/chat";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export interface StreamChatOptions {
  /**
   * Active mode slug to prepend as `#<mode>` to the outgoing message.
   * The worker's deterministic classifier parses leading trigger tokens
   * and applies them as a per-turn override (bt-servant-worker #199 / #211).
   */
  mode?: string | null;
  /** Active language slug to prepend as `@<language>`. */
  language?: string | null;
  signal?: AbortSignal;
}

/**
 * Build the wire message: prepend `#<mode>` and/or `@<language>` to the
 * user's text so the worker classifier applies them as a per-turn override.
 * Strings only — both falsy means no prefix is added.
 */
export function applyTriggerPrefix(
  message: string,
  mode?: string | null,
  language?: string | null
): string {
  const parts: string[] = [];
  if (mode) parts.push(`#${mode}`);
  if (language) parts.push(`@${language}`);
  if (parts.length === 0) return message;
  return `${parts.join(" ")} ${message}`;
}

export async function streamChat(
  message: string,
  userId: string,
  options: StreamChatOptions = {}
): Promise<Response> {
  const wireMessage = applyTriggerPrefix(
    message,
    options.mode,
    options.language
  );
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({
      message: wireMessage,
      message_type: "text",
      user_id: userId,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chat stream failed (${res.status}): ${body}`);
  }

  return res;
}

export async function fetchHistory(
  userId: string,
  limit = 50,
  offset = 0,
  signal?: AbortSignal
): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    user_id: userId,
  });
  const res = await fetch(`/api/chat/history?${params.toString()}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`History fetch failed (${res.status}): ${body}`);
  }

  return (await res.json()) as ChatHistoryResponse;
}

export async function deleteHistory(
  userId: string,
  signal?: AbortSignal
): Promise<void> {
  const params = new URLSearchParams({ user_id: userId });
  const res = await fetch(`/api/chat/history?${params.toString()}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Delete history failed (${res.status}): ${body}`);
  }
}

export async function deleteMemory(
  userId: string,
  signal?: AbortSignal
): Promise<void> {
  const params = new URLSearchParams({ user_id: userId });
  const res = await fetch(`/api/chat/memory?${params.toString()}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Delete memory failed (${res.status}): ${body}`);
  }
}
