import { type RefObject, useCallback, useId, useState } from "react";

import { NO_EDIT_RIGHTS_REASON } from "@/lib/mode-copy";
import {
  MODE_DETAILS_LIMITS,
  type ModeDetails,
  type StoredModeDetails,
  describeModeDetailsSaveBlock,
  modeDetailsChanged,
  modeDetailsFromStored,
  modeDetailsOverLimit,
} from "@/lib/mode-details";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TextareaField } from "@/components/textarea-field";

/** The muted footer/body callout every notice in this sheet uses. */
const CALLOUT_CLASS =
  "bg-muted/40 text-muted-foreground border-border rounded-r-md border-l-2 px-3 py-2 text-xs leading-relaxed";

/** Content id, so the page's opener can point `aria-controls` at it. */
export const MODE_DETAILS_SHEET_ID = "mode-details-sheet";

interface ModeDetailsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The control that opened the sheet. It lives outside the Sheet tree (a
   * plain toolbar button, not SheetTrigger), so Radix has no trigger to
   * return focus to on close; we do it ourselves.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** Display name, for the header. Falls back to nothing, not the slug. */
  modeLabel?: string;
  /**
   * Server truth for the two fields — the page's per-mode cache, which every
   * editor PUT re-asserts from. The form initialises from it on each open.
   */
  stored: StoredModeDetails | undefined;
  canEdit: boolean;
  /** A save is in flight somewhere on the page; Save must wait it out. */
  isSaving?: boolean;
  /**
   * The editor's draft is unsaved and its last save failed (#337). Save is
   * refused and the sheet says why, since the details PUT would re-send that
   * draft and the editor that could resolve it is under this sheet's overlay.
   */
  documentUnsaved: boolean;
  /**
   * Saves the next details. The panel never saves; the page does, through
   * the same mode-save path as everything else, and NEVER rejects this
   * promise — a failure is recorded in `saveError` instead, so it survives
   * the sheet unmounting on close.
   */
  onSave: (next: ModeDetails) => void | Promise<void>;
  /**
   * The page's record of the last failed details save, rendered inside the
   * sheet: the page's own error banner sits under the sheet's modal overlay,
   * where a user mid-edit can neither read it nor act on it.
   */
  saveError: string | null;
}

/**
 * Mode details (#328): edit an existing mode's description and first-contact
 * welcome message. Until this panel, both could be authored only on the
 * create card or by export → hand-edit → import.
 *
 * Thin by design: `lib/mode-details` owns the stored ↔ form rules and the
 * clear semantics; the page owns saving and `open`, so a failed save keeps
 * the panel exactly where the user left it.
 */
export function ModeDetailsPanel(props: ModeDetailsPanelProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {/* Accent rail in the Modes brand color, mirroring the priorities
          panel — this edits the mode record and should read that way the
          moment it slides in. */}
      <SheetContent
        id={MODE_DETAILS_SHEET_ID}
        className="w-full gap-0 border-l-[3px] p-0 sm:max-w-md"
        style={{ borderLeftColor: "var(--brand-modes)" }}
        // The page refuses dismissal mid-save; hide the chrome X in that
        // window so nothing on screen merely LOOKS dismissible.
        showCloseButton={!props.isSaving}
        onCloseAutoFocus={(event) => {
          const target = props.returnFocusTo?.current;
          // Null when the opener has unmounted (selection cleared); let
          // Radix fall through to its default rather than focus nothing.
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        {/* Radix unmounts this subtree when closed, which is what
            re-initialises the form from `stored` on each open. */}
        <PanelBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  modeLabel,
  stored,
  canEdit,
  isSaving = false,
  documentUnsaved,
  onSave,
  onOpenChange,
  saveError,
}: ModeDetailsPanelProps) {
  const ids = useId();
  const [form, setForm] = useState<ModeDetails>(() =>
    modeDetailsFromStored(stored)
  );
  const [saving, setSaving] = useState(false);

  const changed = modeDetailsChanged(stored, form);
  const overLimit = modeDetailsOverLimit(form);
  const busy = isSaving || saving;

  const saveBlock = describeModeDetailsSaveBlock({
    canEdit,
    busy,
    documentUnsaved,
    changed,
    overLimit,
    hasSaveError: saveError !== null,
  });
  // #337 — the one block the user cannot clear from inside the sheet: it is
  // written out in the footer rather than left to the disabled button's
  // title (no hover on touch), and the fields are held while it stands, so
  // nobody types details into a form that cannot save them. Read off the
  // gate, so the ranking lives in `describeModeDetailsSaveBlock` alone.
  const blockIsDocument = saveBlock?.kind === "document";
  const fieldsHeld = busy || blockIsDocument;
  const failureTail = blockIsDocument ? "." : ", so you can try again.";

  // Saving — and recording a failed save — is the page's job (`saveError`
  // comes back down as a prop). The await only scopes the local busy state;
  // the catch is a belt-and-braces guard for the never-rejects contract.
  const submit = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(form);
    } catch {
      // The page records and renders the failure via `saveError`.
    } finally {
      setSaving(false);
    }
  }, [form, onSave]);

  const setField = (field: keyof ModeDetails, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const descriptionId = `${ids}-description`;
  const welcomeId = `${ids}-welcome`;
  const saveHelpId = `${ids}-save-help`;
  const readOnlyHelpId = `${ids}-read-only`;
  const welcomeTrimmed = form.welcomeMessage.trim();

  return (
    <>
      <SheetHeader className="border-b p-4 sm:px-5">
        <SheetTitle className="text-base tracking-tight">
          Mode details
          {modeLabel && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {modeLabel}
            </span>
          )}
        </SheetTitle>
        <SheetDescription>
          What this mode is for, and how it introduces itself the first time
          someone messages it.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:px-5">
        {!canEdit && (
          <p id={readOnlyHelpId} className={CALLOUT_CLASS} role="status">
            Read-only. {NO_EDIT_RIGHTS_REASON}
          </p>
        )}

        <TextareaField
          id={descriptionId}
          label="Description"
          value={form.description}
          onChange={(v) => setField("description", v)}
          max={MODE_DETAILS_LIMITS.description}
          rows={3}
          placeholder="Optional description for this mode..."
          help="Optional. A short note on what this mode is for."
          readOnly={!canEdit}
          describedBy={canEdit ? undefined : readOnlyHelpId}
          disabled={fieldsHeld}
        />

        {/* #311 (part 2) — literally the same control the create card uses
            for this field, so authoring and editing cannot drift apart. */}
        <TextareaField
          id={welcomeId}
          label="First-contact welcome message"
          value={form.welcomeMessage}
          onChange={(v) => setField("welcomeMessage", v)}
          max={MODE_DETAILS_LIMITS.welcomeMessage}
          rows={5}
          placeholder="Sent once, the first time someone messages this mode…"
          help="Optional. Your welcome copy only — the WhatsApp share link is added automatically, so leave it out."
          readOnly={!canEdit}
          describedBy={canEdit ? undefined : readOnlyHelpId}
          disabled={fieldsHeld}
        />

        {/* How it lands: the welcome is a WhatsApp message, so show it as one.
            The share line is rendered as a placeholder on purpose — the worker
            composes the real link from the number and slug at send time, and
            imitating its exact wording here would be a promise this panel
            can't keep. */}
        {welcomeTrimmed !== "" && (
          <div className="space-y-1.5">
            <h3 className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
              How it reads on WhatsApp
            </h3>
            <div
              className="bg-card relative max-w-[92%] rounded-2xl rounded-tl-sm border px-3.5 py-2.5 shadow-xs"
              aria-label="Preview of the welcome message as it will appear on WhatsApp"
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {welcomeTrimmed}
              </p>
              <p className="text-muted-foreground mt-2 text-xs italic">
                + the WhatsApp share link for this mode, added automatically
              </p>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Sent once to each person, the first time they message this mode.
              People who have already messaged it will not receive it.
            </p>
          </div>
        )}
      </div>

      <SheetFooter className="gap-3 border-t p-4 sm:px-5">
        {saveError && (
          <p
            className="bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2 text-xs"
            role="alert"
          >
            <span className="font-medium">Save failed.</span> {saveError}{" "}
            Nothing was saved — your changes are still here{failureTail}
          </p>
        )}
        {/* One element carries the reason Save is unavailable, under the id
            the button's aria-describedby names — a disabled button is out of
            the tab order and gets no hover on touch, so the title alone can't
            carry it (same idiom the Modes header uses for its gated controls).
            Visible only for the document block, after the alert so the
            diagnosis precedes the prescription; the rest stay for assistive
            tech alone. `canEdit` gates it so a read-only viewer isn't read an
            orphaned rights notice twice. */}
        {canEdit && saveBlock && (
          <p
            id={saveHelpId}
            role={blockIsDocument ? "status" : undefined}
            className={blockIsDocument ? CALLOUT_CLASS : "sr-only"}
          >
            {saveBlock.message}
            {blockIsDocument &&
              changed &&
              " Anything typed here won't be kept."}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  void submit();
                }}
                disabled={saveBlock !== null}
                title={saveBlock?.message}
                aria-describedby={saveBlock ? saveHelpId : undefined}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </>
          )}
        </div>
      </SheetFooter>
    </>
  );
}
