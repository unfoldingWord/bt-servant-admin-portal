import { PROMPT_SLOTS, SLOT_LABELS } from "@/types/prompt-override";

// Canonical H2 scaffold a new mode opens with. The seven sections mirror
// the worker's `toMarkdownView` synthesis (worker PR #213) so a freshly
// created markdown mode and a not-yet-migrated slotted mode produce the
// same structural shape on first GET — round-trip identity holds after
// the first PUT migrates the record.
export const MODE_DOCUMENT_SCAFFOLD = PROMPT_SLOTS.map(
  (slot) => `## ${SLOT_LABELS[slot]}\n\n`
).join("");
