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
import { Pencil, Save, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MAX_SLOT_LENGTH,
  type PromptSlot,
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
}

export function PromptPanel({
  slot,
  value,
  onSave,
  isSaving,
}: PromptPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  // Keep draft synced with value when not actively editing
  useEffect(() => {
    if (!editing) {
      setDraft(value ?? "");
    }
  }, [value, editing]);

  const startEdit = useCallback(() => {
    setDraft(value ?? "");
    setEditing(true);
  }, [value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value ?? "");
  }, [value]);

  const save = useCallback(() => {
    onSave(draft);
    setEditing(false);
  }, [draft, onSave]);

  const overLimit = draft.length > MAX_SLOT_LENGTH;
  const hasValue = !!value;
  const colors = SLOT_COLORS[slot];
  const darkColors = SLOT_COLORS_DARK[slot];

  return (
    <Card
      className={cn(
        "gap-3 transition-shadow duration-200",
        !editing && "hover:shadow-md"
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div
            className="slot-icon flex size-8 shrink-0 items-center justify-center rounded-lg"
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
              className="text-base"
              style={{
                "--fa-primary-color": "var(--icon-fa-primary)",
                "--fa-primary-opacity": "1",
                "--fa-secondary-color": "var(--icon-fa-secondary)",
                "--fa-secondary-opacity": "0.7",
              }}
            />
          </div>
          <CardTitle className="text-sm tracking-tight">
            {SLOT_LABELS[slot]}
          </CardTitle>
        </div>
        <CardAction>
          {!editing && (
            <Button variant="ghost" size="icon-xs" onClick={startEdit}>
              <Pencil className="size-3.5" />
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="resize-y font-mono text-xs leading-relaxed"
              placeholder={`Enter ${SLOT_LABELS[slot].toLowerCase()} override...`}
              autoFocus
            />
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
        ) : hasValue ? (
          <pre className="text-foreground/70 max-h-40 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {value}
          </pre>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            No override set
          </p>
        )}
      </CardContent>
    </Card>
  );
}
