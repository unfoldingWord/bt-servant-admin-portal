import { useCallback, useState } from "react";
import {
  faBookOpen,
  faBrain,
  faCompass,
  faLightbulb,
  faMemoPad,
  faUserCrown,
  faWandMagicSparkles,
} from "@fortawesome/pro-light-svg-icons";
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
  identity: faUserCrown,
  methodology: faCompass,
  tool_guidance: faWandMagicSparkles,
  instructions: faLightbulb,
  client_instructions: faBookOpen,
  memory_instructions: faBrain,
  closing: faMemoPad,
} as const;

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
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md",
              hasValue
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            <FontAwesomeIcon icon={SLOT_ICONS[slot]} className="text-sm" />
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
