import type { ChatResponse, SSEEvent } from "@/types/chat";

export interface SSEStreamCallbacks {
  onStatus?: (message: string) => void;
  onProgress?: (text: string, accumulated: string) => void;
  onComplete?: (response: ChatResponse) => void;
  onError?: (error: string) => void;
  onToolUse?: (tool: string, input: Record<string, unknown>) => void;
  onToolResult?: (tool: string, result: string) => void;
}

export async function consumeSSEStream(
  response: Response,
  callbacks: SSEStreamCallbacks
): Promise<{ finalText: string; hadStreaming: boolean }> {
  if (!response.body) {
    throw new Error("Response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        let event: SSEEvent;
        try {
          event = JSON.parse(line.slice(6)) as SSEEvent;
        } catch {
          continue;
        }

        switch (event.type) {
          case "status":
            callbacks.onStatus?.(event.message);
            break;
          case "progress":
            accumulated += event.text;
            callbacks.onProgress?.(event.text, accumulated);
            break;
          case "complete": {
            const finalText =
              event.response.responses.join("\n\n") || accumulated;
            callbacks.onComplete?.(event.response);
            return { finalText, hadStreaming: accumulated.length > 0 };
          }
          case "error":
            callbacks.onError?.(event.error);
            throw new Error(event.error);
          case "tool_use":
            callbacks.onToolUse?.(event.tool, event.input);
            break;
          case "tool_result":
            callbacks.onToolResult?.(event.tool, event.result);
            break;
          case "keepalive":
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { finalText: accumulated, hadStreaming: accumulated.length > 0 };
}
