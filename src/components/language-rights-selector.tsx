import { useMemo } from "react";

import type { LanguageRights } from "@/types/auth";
import type { Language } from "@/types/language";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface LanguageRightsSelectorProps {
  value: LanguageRights | undefined;
  onChange: (next: LanguageRights) => void;
  availableLanguages: Language[] | undefined;
  disabled?: boolean;
  // When true, show a hint that undefined === full access (legacy users).
  // Once the admin clicks anything the value becomes defined.
  showLegacyHint?: boolean;
}

export function LanguageRightsSelector({
  value,
  onChange,
  availableLanguages,
  disabled = false,
  showLegacyHint = false,
}: LanguageRightsSelectorProps) {
  const isFull = value === "*";
  const isLegacy = value === undefined;
  const selected = useMemo<Set<string>>(
    () => (Array.isArray(value) ? new Set(value) : new Set()),
    [value]
  );

  const toggleLanguage = (name: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next].sort());
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Language access</Label>
        {isLegacy && showLegacyHint && (
          <p className="text-muted-foreground text-xs">
            This user predates the language-rights system. They currently have
            full access by default. Picking any option below will lock that in
            explicitly.
          </p>
        )}
      </div>

      <fieldset className="space-y-2" disabled={disabled}>
        <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
          <input
            type="radio"
            name="language-rights-mode"
            checked={isFull}
            onChange={() => onChange("*")}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Full access</div>
            <div className="text-muted-foreground text-xs">
              Can read and edit every language tuning document.
            </div>
          </div>
        </label>

        <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
          <input
            type="radio"
            name="language-rights-mode"
            checked={!isFull && !isLegacy}
            onChange={() => onChange([...selected].sort())}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-2">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Specific languages</div>
              <div className="text-muted-foreground text-xs">
                Only the languages selected below. Leave all unchecked to deny
                access entirely.
              </div>
            </div>

            {!isFull && !isLegacy && (
              <div className="flex flex-wrap gap-1.5">
                {availableLanguages === undefined ? (
                  <span className="text-muted-foreground text-xs">
                    Loading languages…
                  </span>
                ) : availableLanguages.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    No languages defined yet.
                  </span>
                ) : (
                  availableLanguages.map((lang) => {
                    const checked = selected.has(lang.name);
                    return (
                      <button
                        key={lang.name}
                        type="button"
                        onClick={() => toggleLanguage(lang.name)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent"
                        )}
                      >
                        {checked && (
                          <span className="mr-1" aria-hidden="true">
                            ✓
                          </span>
                        )}
                        {lang.label || lang.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </label>
      </fieldset>

      {Array.isArray(value) && value.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {value.length === 1
            ? "1 language granted"
            : `${value.length} languages granted`}
        </p>
      )}
      {Array.isArray(value) && value.length === 0 && (
        <Badge
          variant="outline"
          className="border-destructive text-destructive"
        >
          No access
        </Badge>
      )}
    </div>
  );
}
