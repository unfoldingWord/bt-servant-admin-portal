import { type RefObject, useCallback, useId, useState } from "react";

import {
  MODE_DETAILS_LIMITS,
  type ModeDetails,
  type StoredModeDetails,
  modeDetailsChanged,
  modeDetailsFromStored,
  modeDetailsOverLimit,
} from "@/lib/mode-details";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

// Same sentence the Modes header uses for the same denial (see
// NO_EDIT_RIGHTS_REASON in app/pages/modes.tsx). One denial, one wording.
const NO_EDIT_RIGHTS_REASON = "You don't have edit rights on this mode.";

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

  // `changed` stops blocking once a save has failed: the form still holds
  // the edit the user wants, so "nothing has changed" would be precisely
  // backwards on the retry path.
  const saveBlockedReason = !canEdit
    ? NO_EDIT_RIGHTS_REASON
    : busy
      ? "Another save is in flight. Try again in a moment."
      : overLimit === "description"
        ? `The description is over ${String(MODE_DETAILS_LIMITS.description)} characters.`
        : overLimit === "welcomeMessage"
          ? `The welcome message is over ${String(MODE_DETAILS_LIMITS.welcomeMessage)} characters.`
          : !changed && saveError === null
            ? "Nothing has changed."
            : null;

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
          <p
            id={readOnlyHelpId}
            className="bg-muted/40 text-muted-foreground border-border rounded-r-md border-l-2 px-3 py-2 text-xs leading-relaxed"
            role="status"
          >
            Read-only. {NO_EDIT_RIGHTS_REASON}
          </p>
        )}

        <Field
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
          disabled={busy}
        />

        {/* #311 (part 2) — the same field, helper copy and cap as the create
            card, so authoring reads the same on both surfaces. */}
        <Field
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
          disabled={busy}
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
            Nothing was saved — your changes are still here, so you can try
            again.
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
                disabled={saveBlockedReason !== null}
                title={saveBlockedReason ?? undefined}
                aria-describedby={saveBlockedReason ? saveHelpId : undefined}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
              {/* A disabled button is out of the tab order and gets no hover
                  on touch, so the title alone can't carry the reason. Same
                  idiom the Modes header uses for its gated controls. */}
              {saveBlockedReason && (
                <span id={saveHelpId} className="sr-only">
                  {saveBlockedReason}
                </span>
              )}
            </>
          )}
        </div>
      </SheetFooter>
    </>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows: number;
  placeholder: string;
  help: string;
  readOnly: boolean;
  disabled: boolean;
  describedBy?: string;
}

/** One labelled textarea with helper copy and a visible character budget. */
function Field({
  id,
  label,
  value,
  onChange,
  max,
  rows,
  placeholder,
  help,
  readOnly,
  disabled,
  describedBy,
}: FieldProps) {
  const helpId = `${id}-help`;
  const nearCap = value.length >= max * 0.9;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={max}
        readOnly={readOnly}
        disabled={disabled}
        className="text-sm"
        aria-describedby={[helpId, describedBy].filter(Boolean).join(" ")}
      />
      <div className="flex items-start justify-between gap-2">
        <p id={helpId} className="text-muted-foreground text-xs">
          {help}
        </p>
        {/* Visible awareness of the cap `maxLength` enforces, so hitting it
            reads as a limit rather than a silent truncation. */}
        <span
          className={cn(
            "text-muted-foreground shrink-0 text-xs tabular-nums",
            nearCap && "text-foreground"
          )}
          aria-hidden="true"
        >
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}
