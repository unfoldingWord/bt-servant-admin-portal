import type { ChatHistoryResponse } from "@/types/chat";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export async function streamChat(
  message: string,
  userId: string,
  signal?: AbortSignal
): Promise<Response> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ message, message_type: "text", user_id: userId }),
    signal,
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
