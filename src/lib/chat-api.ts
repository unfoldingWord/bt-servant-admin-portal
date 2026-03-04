import type { EnqueueResponse, PollResponse } from "@/types/chat";

export async function enqueueMessage(
  message: string,
  signal?: AbortSignal
): Promise<EnqueueResponse> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Poll failed (${res.status}): ${body}`);
  }

  return (await res.json()) as PollResponse;
}
