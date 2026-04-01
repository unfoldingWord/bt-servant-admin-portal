// SSE event types from the engine's streaming endpoint

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

export interface SSEKeepaliveEvent {
  type: "keepalive";
}

export type SSEEvent =
  | SSEStatusEvent
  | SSEProgressEvent
  | SSECompleteEvent
  | SSEErrorEvent
  | SSEToolUseEvent
  | SSEToolResultEvent
  | SSEKeepaliveEvent;

export interface ChatResponse {
  responses: string[];
  response_language: string;
  voice_audio_base64: string | null;
  voice_audio_url: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
}

// TODO: Remove after Baruch SSE migration
export interface EnqueueRequest {
  message: string;
  message_type: string;
}

// TODO: Remove after Baruch SSE migration
export interface EnqueueResponse {
  message_id: string;
}

// TODO: Remove after Baruch SSE migration
export interface PollEvent {
  event: string;
  data: string;
}

// TODO: Remove after Baruch SSE migration
export interface PollResponse {
  message_id: string;
  events: PollEvent[];
  done: boolean;
  cursor: string;
}

export interface ChatHistoryEntry {
  user_message: string;
  assistant_response: string;
  timestamp: number;
  created_at?: string | null;
}

export interface ChatHistoryResponse {
  user_id: string;
  entries: ChatHistoryEntry[];
  total_count: number;
  limit: number;
  offset: number;
}
