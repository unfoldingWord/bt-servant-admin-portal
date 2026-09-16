import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// One labelled, capped textarea with helper copy and a visible character
// budget. Extracted (#328) because the create card and the details panel edit
// the SAME two fields against the same worker caps — two copies of this markup
// meant the cap, the helper sentence and the counter could drift apart between
// the surface that authors a mode and the surface that edits it.

interface TextareaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Worker cap. Enforced by `maxLength` and shown in the counter. */
  max: number;
  rows: number;
  placeholder?: string;
  /** Helper sentence under the field; also the field's accessible description. */
  help?: string;
  /** Extra id to join onto `aria-describedby` (e.g. a read-only notice). */
  describedBy?: string;
  readOnly?: boolean;
  disabled?: boolean;
}

export function TextareaField({
  id,
  label,
  value,
  onChange,
  max,
  rows,
  placeholder,
  help,
  describedBy,
  readOnly = false,
  disabled = false,
}: TextareaFieldProps) {
  const helpId = `${id}-help`;
  // Hitting a cap should read as a limit rather than a silent truncation, so
  // the count stops being decoration as it approaches one.
  const nearCap = value.length >= max * 0.9;
  const describedByIds = [help ? helpId : null, describedBy]
    .filter(Boolean)
    .join(" ");

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
        aria-describedby={describedByIds || undefined}
      />
      <div className="flex items-start justify-between gap-2">
        {help ? (
          <p id={helpId} className="text-muted-foreground text-xs">
            {help}
          </p>
        ) : (
          <span />
        )}
        {/* Decorative: the textarea already enforces the cap, and a live
            character count read out on every keystroke is noise. */}
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
