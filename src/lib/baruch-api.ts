import type {
  ChatHistoryResponse,
  EnqueueResponse,
  PollResponse,
} from "@/types/chat";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export async function baruchEnqueueMessage(
  message: string,
  signal?: AbortSignal
): Promise<EnqueueResponse> {
  const res = await fetch("/api/baruch/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ message, message_type: "text" }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Enqueue failed (${res.status}): ${body}`);
  }

  return (await res.json()) as EnqueueResponse;
}

export async function baruchPollEvents(
  messageId: string,
  cursor: string,
  signal?: AbortSignal
): Promise<PollResponse> {
  const params = new URLSearchParams({ message_id: messageId, cursor });
  const res = await fetch(`/api/baruch/stream/poll?${params.toString()}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Poll failed (${res.status}): ${body}`);
  }

  return (await res.json()) as PollResponse;
}

export async function baruchFetchHistory(
  limit = 50,
  offset = 0,
  signal?: AbortSignal
): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`/api/baruch/history?${params.toString()}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`History fetch failed (${res.status}): ${body}`);
  }

  return (await res.json()) as ChatHistoryResponse;
}

export async function baruchDeleteHistory(signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/baruch/history", {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Delete history failed (${res.status}): ${body}`);
  }
}
