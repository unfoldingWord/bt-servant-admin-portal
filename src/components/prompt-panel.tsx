import { useCallback, useEffect, useState } from "react";
import {
  faBookOpen,
  faBrain,
  faLightbulb,
  faMemoPad,
  faPersonChalkboard,
  faRoute,
  faScrewdriverWrench,
} from "@fortawesome/pro-duotone-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Eye, Maximize2, Pencil, Save, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MAX_SLOT_LENGTH,
  type PromptSlot,
  SLOT_DESCRIPTIONS,
  SLOT_LABELS,
} from "@/types/prompt-override";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const SLOT_ICONS = {
  identity: faPersonChalkboard,
  methodology: faRoute,
  tool_guidance: faScrewdriverWrench,
  instructions: faLightbulb,
  client_instructions: faBookOpen,
  memory_instructions: faBrain,
  closing: faMemoPad,
} as const;

// Analogous blue/teal palette — each slot gets a unique hue in the cool range
// [primary, secondary] color pairs for duotone icons
const SLOT_COLORS: Record<
  PromptSlot,
  { primary: string; secondary: string; bg: string }
> = {
  identity: {
    primary: "oklch(0.50 0.16 270)",
    secondary: "oklch(0.65 0.12 270)",
    bg: "oklch(0.95 0.02 270)",
  },
  methodology: {
    primary: "oklch(0.48 0.16 248)",
    secondary: "oklch(0.63 0.12 248)",
    bg: "oklch(0.95 0.02 248)",
  },
  tool_guidance: {
    primary: "oklch(0.52 0.12 200)",
    secondary: "oklch(0.68 0.09 200)",
    bg: "oklch(0.95 0.02 200)",
  },
  instructions: {
    primary: "oklch(0.55 0.10 175)",
    secondary: "oklch(0.70 0.08 175)",
    bg: "oklch(0.95 0.02 175)",
  },
  client_instructions: {
    primary: "oklch(0.50 0.14 220)",
    secondary: "oklch(0.65 0.10 220)",
    bg: "oklch(0.95 0.02 220)",
  },
  memory_instructions: {
    primary: "oklch(0.50 0.16 290)",
    secondary: "oklch(0.65 0.12 290)",
    bg: "oklch(0.95 0.02 290)",
  },
  closing: {
    primary: "oklch(0.48 0.12 240)",
    secondary: "oklch(0.63 0.09 240)",
    bg: "oklch(0.95 0.015 240)",
  },
};

// Dark mode variants — same hues, shifted for dark backgrounds
const SLOT_COLORS_DARK: Record<
  PromptSlot,
  { primary: string; secondary: string; bg: string }
> = {
  identity: {
    primary: "oklch(0.75 0.14 270)",
    secondary: "oklch(0.55 0.10 270)",
    bg: "oklch(0.25 0.02 270)",
  },
  methodology: {
    primary: "oklch(0.72 0.14 248)",
    secondary: "oklch(0.52 0.10 248)",
    bg: "oklch(0.25 0.02 248)",
  },
  tool_guidance: {
    primary: "oklch(0.75 0.10 200)",
    secondary: "oklch(0.55 0.08 200)",
    bg: "oklch(0.25 0.02 200)",
  },
  instructions: {
    primary: "oklch(0.78 0.08 175)",
    secondary: "oklch(0.58 0.06 175)",
    bg: "oklch(0.25 0.02 175)",
  },
  client_instructions: {
    primary: "oklch(0.72 0.12 220)",
    secondary: "oklch(0.52 0.09 220)",
    bg: "oklch(0.25 0.02 220)",
  },
  memory_instructions: {
    primary: "oklch(0.75 0.14 290)",
    secondary: "oklch(0.55 0.10 290)",
    bg: "oklch(0.25 0.02 290)",
  },
  closing: {
    primary: "oklch(0.72 0.10 240)",
    secondary: "oklch(0.52 0.08 240)",
    bg: "oklch(0.25 0.015 240)",
  },
};

interface PromptPanelProps {
  slot: PromptSlot;
  value: string | undefined;
  onSave: (value: string) => void;
  isSaving: boolean;
  readOnly?: boolean;
}

export function PromptPanel({
  slot,
  value,
  onSave,
  isSaving,
  readOnly = false,
}: PromptPanelProps) {
  const [mode, setMode] = useState<"collapsed" | "viewing" | "editing">(
    "collapsed"
  );
  const [draft, setDraft] = useState(value ?? "");
  const [expanded, setExpanded] = useState(false);

  // When value updates (after a successful save or external change),
  // sync draft and collapse back from editing mode
  useEffect(() => {
    setDraft(value ?? "");
    if (mode === "editing") {
      setMode("collapsed");
      setExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to value changes
  }, [value]);

  const startView = useCallback(() => {
    setMode("viewing");
  }, []);

  const startEdit = useCallback(() => {
    setDraft(value ?? "");
    setMode("editing");
  }, [value]);

  const cancel = useCallback(() => {
    setMode("collapsed");
    setDraft(value ?? "");
  }, [value]);

  const save = useCallback(() => {
    onSave(draft);
    // Panel collapses when `value` updates after successful save (via useEffect above)
  }, [draft, onSave]);

  const handleExpandedOpenChange = useCallback(
    (open: boolean) => {
      if (!open && mode === "editing") {
        setDraft(value ?? "");
        setMode("collapsed");
      }
      setExpanded(open);
    },
    [mode, value]
  );

  const overLimit = draft.length > MAX_SLOT_LENGTH;
  const hasValue = !!value;
  const colors = SLOT_COLORS[slot];
  const darkColors = SLOT_COLORS_DARK[slot];

  return (
    <Card
      className={cn(
        "gap-3 transition-shadow duration-200",
        mode === "collapsed" && "hover:shadow-md"
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div
            className="slot-icon flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={
              {
                "--icon-bg": colors.bg,
                "--icon-bg-dark": darkColors.bg,
                "--icon-fa-primary": colors.primary,
                "--icon-fa-primary-dark": darkColors.primary,
                "--icon-fa-secondary": colors.secondary,
                "--icon-fa-secondary-dark": darkColors.secondary,
                backgroundColor: "var(--icon-bg)",
              } as React.CSSProperties
            }
          >
            <FontAwesomeIcon
              icon={SLOT_ICONS[slot]}
              className="text-lg"
              style={{
                "--fa-primary-color": "var(--icon-fa-primary)",
                "--fa-primary-opacity": "1",
                "--fa-secondary-color": "var(--icon-fa-secondary)",
                "--fa-secondary-opacity": "0.7",
              }}
            />
          </div>
          <div>
            <CardTitle className="text-sm tracking-tight">
              {SLOT_LABELS[slot]}
            </CardTitle>
            <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
              {SLOT_DESCRIPTIONS[slot]}
            </p>
          </div>
        </div>
        <CardAction>
          {mode === "collapsed" && (
            <div className="flex gap-0.5">
              {hasValue && (
                <Button variant="ghost" size="icon-xs" onClick={startView}>
                  <Eye className="size-4" />
                </Button>
              )}
              {!readOnly && (
                <Button variant="ghost" size="icon-xs" onClick={startEdit}>
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {mode === "editing" ? (
          <div className="space-y-3">
            <div className="group relative">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="bg-background max-h-64 resize-y font-mono text-xs leading-relaxed dark:bg-white/[0.06]"
                placeholder={`Enter ${SLOT_LABELS[slot].toLowerCase()} override...`}
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-2 bottom-2 size-11 opacity-100 transition-opacity sm:size-6 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => setExpanded(true)}
                title="Expand"
                type="button"
              >
                <Maximize2 className="size-4 sm:size-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overLimit
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {draft.length.toLocaleString()}/
                {MAX_SLOT_LENGTH.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={cancel}
                  disabled={isSaving}
                >
                  <X className="mr-1 size-3" />
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={save}
                  disabled={isSaving || overLimit}
                >
                  <Save className="mr-1 size-3" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : mode === "viewing" ? (
          <div className="space-y-3">
            <div className="group relative">
              <pre className="bg-background max-h-64 overflow-y-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap dark:bg-white/[0.06]">
                {value}
              </pre>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-2 bottom-2 size-11 opacity-100 transition-opacity sm:size-6 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => setExpanded(true)}
                title="Expand"
                type="button"
              >
                <Maximize2 className="size-4 sm:size-3" />
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={cancel}>
                <X className="mr-1 size-3" />
                Close
              </Button>
              {!readOnly && (
                <Button size="xs" onClick={startEdit}>
                  <Pencil className="mr-1 size-3" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        ) : hasValue ? (
          <p className="text-muted-foreground text-xs">Override set</p>
        ) : (
          <p className="text-muted-foreground/60 text-xs italic">
            No override set
          </p>
        )}
      </CardContent>

      <Dialog open={expanded} onOpenChange={handleExpandedOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 p-0"
        >
          <DialogHeader className="flex-row items-center gap-2.5 border-b px-6 py-4">
            <div
              className="slot-icon flex size-8 shrink-0 items-center justify-center rounded-md"
              style={
                {
                  "--icon-bg": colors.bg,
                  "--icon-bg-dark": darkColors.bg,
                  "--icon-fa-primary": colors.primary,
                  "--icon-fa-primary-dark": darkColors.primary,
                  "--icon-fa-secondary": colors.secondary,
                  "--icon-fa-secondary-dark": darkColors.secondary,
                  backgroundColor: "var(--icon-bg)",
                } as React.CSSProperties
              }
            >
              <FontAwesomeIcon
                icon={SLOT_ICONS[slot]}
                className="text-sm"
                style={{
                  "--fa-primary-color": "var(--icon-fa-primary)",
                  "--fa-primary-opacity": "1",
                  "--fa-secondary-color": "var(--icon-fa-secondary)",
                  "--fa-secondary-opacity": "0.7",
                }}
              />
            </div>
            <DialogTitle className="text-sm">{SLOT_LABELS[slot]}</DialogTitle>
            <DialogDescription className="sr-only">
              Expanded editor for the {SLOT_LABELS[slot].toLowerCase()} prompt
              slot
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 p-6">
            {mode === "editing" ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="bg-background h-full resize-none font-mono text-xs leading-relaxed dark:bg-white/[0.06]"
                placeholder={`Enter ${SLOT_LABELS[slot].toLowerCase()} override...`}
              />
            ) : (
              <pre className="bg-background h-full overflow-y-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap dark:bg-white/[0.06]">
                {value}
              </pre>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            {mode === "editing" ? (
              <>
                <span
                  className={cn(
                    "mr-auto text-xs tabular-nums",
                    overLimit
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {draft.length.toLocaleString()}/
                  {MAX_SLOT_LENGTH.toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setDraft(value ?? "");
                    setMode("collapsed");
                    setExpanded(false);
                  }}
                  disabled={isSaving}
                >
                  <X className="mr-1 size-3" />
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={save}
                  disabled={isSaving || overLimit}
                >
                  <Save className="mr-1 size-3" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setExpanded(false)}
                >
                  <X className="mr-1 size-3" />
                  Close
                </Button>
                {!readOnly && (
                  <Button size="xs" onClick={startEdit}>
                    <Pencil className="mr-1 size-3" />
                    Edit
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
