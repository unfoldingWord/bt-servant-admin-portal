// SSE event types from the engine's queue/poll endpoint

export interface SSEStatusEvent {
  type: "status";
  message: string;
}

export interface SSEProgressEvent {
  type: "progress";
  text: string;
}

export interface SSECompleteEvent {
  type: "complete";
  response: ChatResponse;
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
  code?: string;
}

export interface SSEToolUseEvent {
  type: "tool_use";
  tool: string;
  input: Record<string, unknown>;
}

export interface SSEToolResultEvent {
  type: "tool_result";
  tool: string;
  result: string;
}

export type SSEEvent =
  | SSEStatusEvent
  | SSEProgressEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEToolUseEvent
  | SSEToolResultEvent;

export interface ChatResponse {
  responses: string[];
  response_language: string;
  voice_audio_base64: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
}

export interface EnqueueRequest {
  message: string;
  message_type: string;
}

export interface EnqueueResponse {
  message_id: string;
}

export interface PollEvent {
  event: string;
  data: string;
}

export interface PollResponse {
  message_id: string;
  events: PollEvent[];
  done: boolean;
  cursor: string;
}
