export type PromptSlot =
  | "identity"
  | "methodology"
  | "tool_guidance"
  | "instructions"
  | "memory_instructions"
  | "closing";

export type PromptOverrides = Partial<Record<PromptSlot, string>>; // max 4000 chars/slot
