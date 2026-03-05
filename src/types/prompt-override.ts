export type PromptSlot =
  | "identity"
  | "methodology"
  | "tool_guidance"
  | "instructions"
  | "client_instructions"
  | "memory_instructions"
  | "closing";

export type PromptOverrides = Partial<Record<PromptSlot, string>>; // max 4000 chars/slot

export const PROMPT_SLOTS: PromptSlot[] = [
  "identity",
  "methodology",
  "tool_guidance",
  "instructions",
  "client_instructions",
  "memory_instructions",
  "closing",
];

export const SLOT_LABELS: Record<PromptSlot, string> = {
  identity: "Identity",
  methodology: "Methodology",
  tool_guidance: "Tool Guidance",
  instructions: "Instructions",
  client_instructions: "Client Instructions",
  memory_instructions: "Memory Instructions",
  closing: "Closing",
};

export const MAX_SLOT_LENGTH = 4000;

export interface PromptMode {
  name: string;
  label?: string;
  description?: string;
  overrides: PromptOverrides;
}

export interface OrgModes {
  modes: PromptMode[];
  default_mode?: string;
}
