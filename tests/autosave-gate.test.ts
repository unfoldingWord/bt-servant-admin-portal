import { describe, expect, it } from "vitest";

import {
  shouldAutoSaveDraft,
  type AutoSaveGateInput,
} from "../src/lib/autosave-gate";

// A mode being edited normally: one pending edit, debounce settled on it.
function gate(overrides: Partial<AutoSaveGateInput> = {}): AutoSaveGateInput {
  return {
    selectedMode: "study",
    isSaving: false,
    draft: "edited",
    debouncedDraft: "edited",
    lastSyncedDoc: "saved",
    lastFailedDoc: null,
    canEdit: true,
    ...overrides,
  };
}

describe("shouldAutoSaveDraft", () => {
  it("saves a settled edit", () => {
    expect(shouldAutoSaveDraft(gate())).toBe(true);
  });

  it("refuses without a selected mode", () => {
    expect(shouldAutoSaveDraft(gate({ selectedMode: null }))).toBe(false);
  });

  it("refuses while a save is in flight", () => {
    expect(shouldAutoSaveDraft(gate({ isSaving: true }))).toBe(false);
  });

  it("refuses without edit rights", () => {
    // The editor renders read-only too; this covers rights revoked mid-edit.
    expect(shouldAutoSaveDraft(gate({ canEdit: false }))).toBe(false);
  });

  it("refuses when the draft already matches the server", () => {
    expect(
      shouldAutoSaveDraft(gate({ draft: "saved", debouncedDraft: "saved" }))
    ).toBe(false);
  });

  it("refuses to retry a document whose save already failed", () => {
    // Otherwise it re-fires on every isPending → false transition.
    expect(shouldAutoSaveDraft(gate({ lastFailedDoc: "edited" }))).toBe(false);
  });

  it("refuses a debounced snapshot the draft has moved past", () => {
    // Mid-typing: the newest text is not what autosave is holding.
    expect(
      shouldAutoSaveDraft(
        gate({ draft: "edited more", debouncedDraft: "edited" })
      )
    ).toBe(false);
  });
});

describe("shouldAutoSaveDraft vs. an out-of-band apply", () => {
  // The regression this gate exists for. Document A is clean pre-#281:
  // draft, debounce and server all agree. The priority panel applies B, which
  // is PUT immediately and acknowledged, but the 800ms debounce still holds A.
  const A = "## Tool Guidance\n\npre-disclosure block\n";
  const B = "## Tool Guidance\n\nrefreshed block with the disclosure\n";

  const justAfterApply = gate({
    draft: B,
    debouncedDraft: A,
    lastSyncedDoc: B,
    lastFailedDoc: null,
  });

  it("refuses to write the pre-apply document back over the applied one", () => {
    // Without the lag check this is `true`: A !== lastSyncedDoc (B) is all the
    // naive gate asked. The PUT would revert the server to A, drag
    // lastSyncedDoc back to A while the draft still shows B — reporting the
    // page dirty right after a SUCCESSFUL save — and a later "Discard and
    // switch" would reload A, losing the applied change with no error shown.
    expect(shouldAutoSaveDraft(justAfterApply)).toBe(false);
  });

  it("is the lag check specifically, not some other clause, that refuses", () => {
    // Pin the reason: every other condition here is satisfied.
    expect(justAfterApply.selectedMode).not.toBeNull();
    expect(justAfterApply.isSaving).toBe(false);
    expect(justAfterApply.canEdit).toBe(true);
    expect(justAfterApply.debouncedDraft).not.toBe(
      justAfterApply.lastSyncedDoc
    );
    expect(justAfterApply.debouncedDraft).not.toBe(
      justAfterApply.lastFailedDoc
    );
  });

  it("stays quiet once the debounce catches up, since B is already saved", () => {
    // 800ms later the snapshot is B — and B is what the server holds, so
    // there is nothing left to write. No trailing PUT, no flicker of dirty.
    expect(shouldAutoSaveDraft({ ...justAfterApply, debouncedDraft: B })).toBe(
      false
    );
  });

  it("still autosaves an edit made after the apply", () => {
    // The guard must not wedge autosave shut for the rest of the session.
    const edited = `${B}Then the user typed this.\n`;
    expect(
      shouldAutoSaveDraft({
        ...justAfterApply,
        draft: edited,
        debouncedDraft: edited,
      })
    ).toBe(true);
  });
});
