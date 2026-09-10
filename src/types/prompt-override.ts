export type PromptSlot =
  | "identity"
  | "methodology"
  | "tool_guidance"
  | "instructions"
  | "client_instructions"
  | "memory_instructions"
  | "closing";

export type PromptOverrides = Partial<Record<PromptSlot, string>>; // max 8000 chars/slot

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
  methodology: "Teaching Methodology",
  tool_guidance: "Tool Guidance",
  instructions: "Instructions",
  client_instructions: "Client Instructions",
  memory_instructions: "Memory Instructions",
  closing: "Closing",
};

export const SLOT_DESCRIPTIONS: Record<PromptSlot, string> = {
  identity: "Defines who the assistant is and its core persona",
  methodology: "The teaching approach and pedagogical framework",
  tool_guidance: "How and when the assistant should use its tools",
  instructions: "General behavioral rules and constraints",
  client_instructions:
    "Instructions specific to the client application (e.g. WhatsApp, Telegram)",
  memory_instructions: "How the assistant manages conversation memory",
  closing: "How the assistant wraps up and signs off",
};

export const MAX_SLOT_LENGTH = 8000;

// #311 (part 2) — first-contact welcome message. Mirrors the worker constant
// `MAX_MODE_WELCOME_MESSAGE_LENGTH` (worker PR #423 / v2.52.0). The authored
// copy is capped at 1000 chars; the worker appends its own deterministic
// `Share this mode: https://wa.me/<num>?text=%23<slug>` line, so that link is
// NOT part of this budget and must not be typed into the field.
export const MAX_MODE_WELCOME_MESSAGE_LENGTH = 1000;

// Modes are stored as a single markdown document on the worker (worker
// PR #213 / issue #200). The portal sends and receives markdown only;
// the worker still accepts legacy slotted PUTs for back-compat but the
// portal does not (per portal issue #82 AC). Legacy slot types
// (`PromptOverrides`, `PROMPT_SLOTS`, etc.) remain in this file because
// org-level prompt overrides (`/api/config/prompt-overrides`) are a
// separate endpoint that has not been migrated.
export interface PromptMode {
  name: string;
  label?: string;
  description?: string;
  document: string;
  published?: boolean;
  // #311 (part 2) — one-time first-contact welcome copy, authored by the
  // admin. Optional scalar on the mode record (worker PR #423 / v2.52.0),
  // capped at MAX_MODE_WELCOME_MESSAGE_LENGTH. Same clear-to-opt-out
  // convention as `description`: the worker treats null/'' as delete and an
  // omitted key as "keep stored", so the portal only sends a value when the
  // field is set. The authored copy is text only — the worker appends the
  // `wa.me` share line itself.
  welcome_message?: string;
  // Previous slugs this mode also answers to (#232 alias mechanism).
  // Engine omits the field when empty rather than returning []; mirror
  // that on the wire by only sending the key when there are entries, and
  // guard reads with `aliases?.length`.
  aliases?: string[];
  // Group-only gate (#209, worker #270): when true the worker hides the
  // mode from `list_modes` and the `#`-trigger in non-group chats
  // (WhatsApp, web, Telegram DMs). Absent and false are semantically
  // identical (mode visible everywhere). Worker merge carries the stored
  // value through when the key is omitted on PUT (same rule as
  // `published`), so the portal always sends the boolean explicitly on
  // save — an omitted key could never turn the flag off.
  requires_group?: boolean;
}

export interface OrgModes {
  modes: PromptMode[];
}
