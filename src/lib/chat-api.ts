import type { EnqueueResponse, PollResponse } from "@/types/chat";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

export async function enqueueMessage(
  message: string,
  signal?: AbortSignal
): Promise<EnqueueResponse> {
  const res = await fetch("/api/chat/stream", {
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

export async function pollEvents(
  messageId: string,
  cursor: string,
  signal?: AbortSignal
): Promise<PollResponse> {
  const params = new URLSearchParams({ message_id: messageId, cursor });
  const res = await fetch(`/api/chat/stream/poll?${params.toString()}`, {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Poll failed (${res.status}): ${body}`);
  }

  return (await res.json()) as PollResponse;
}
