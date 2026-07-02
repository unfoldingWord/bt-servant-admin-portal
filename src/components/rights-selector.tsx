import { useMemo } from "react";

import type { LanguageRights } from "@/types/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

// Parameterized rights matrix — one row, one verb. Used four times in the
// admin user dialogs (language-edit, language-publish, mode-edit,
// mode-publish). The `kind`+`verb` pair scopes the radio group name so
// the four selectors don't clobber each other when rendered side-by-side.
//
// `value === undefined` is the back-compat "no explicit grant yet" state
// for languages (treated as legacy full access by the worker) and "no
// access" for modes (worker/config.ts:rightsFor returns [] for undefined
// mode verbs past the baseline gate). Picking any option locks the
// value in explicitly so the rendered state matches what the worker
// will see, regardless of which kind/verb is selected.

type RightsKind = "language" | "mode";
type RightsVerb = "edit" | "publish";

interface RightsSelectorProps {
  value: LanguageRights | undefined;
  onChange: (next: LanguageRights) => void;
  availableItems: { name: string; label?: string }[] | undefined;
  // True when the list fetch failed. Without this the selector can't
  // tell "still loading" from "errored" (both leave availableItems
  // undefined) and would show "Loading…" forever on a dead query —
  // exactly how the #247 BFF 403 hid itself on staging.
  loadError?: boolean;
  // Refetches the failed list. The dialogs stay mounted across
  // open/close (admin-users.tsx renders them unconditionally), so an
  // errored query never refetches on reopen — a button wired to
  // query.refetch() is the only real recovery short of a window
  // refocus.
  onRetry?: () => void;
  kind: RightsKind;
  verb: RightsVerb;
  disabled?: boolean;
  // When true, show a hint that undefined === full access (legacy users).
  // Once the admin clicks anything the value becomes defined.
  showLegacyHint?: boolean;
}

const LABELS: Record<
  RightsKind,
  Record<
    RightsVerb,
    { heading: string; fullDesc: string; specificDesc: string }
  >
> = {
  language: {
    edit: {
      heading: "Language edit",
      fullDesc: "Can save draft changes to every language tuning document.",
      specificDesc:
        "Can edit only the languages selected below. Leave all unchecked to deny edits entirely.",
    },
    publish: {
      heading: "Language publish",
      fullDesc:
        "Can publish or unpublish every language tuning document, and delete them.",
      specificDesc:
        "Can publish only the languages selected below. Leave all unchecked to deny publishing entirely.",
    },
  },
  mode: {
    edit: {
      heading: "Mode edit",
      fullDesc: "Can save draft changes to every prompt mode.",
      specificDesc:
        "Can edit only the modes selected below. Leave all unchecked to deny edits entirely.",
    },
    publish: {
      heading: "Mode publish",
      fullDesc: "Can publish or unpublish every prompt mode, and delete them.",
      specificDesc:
        "Can publish only the modes selected below. Leave all unchecked to deny publishing entirely.",
    },
  },
};

export function RightsSelector({
  value,
  onChange,
  availableItems,
  loadError = false,
  onRetry,
  kind,
  verb,
  disabled = false,
  showLegacyHint = false,
}: RightsSelectorProps) {
  const isFull = value === "*";
  const isLegacy = value === undefined;
  // Legacy language rights convert to "Specific" by seeding the full
  // item list (see the onChange below). While the list is UNAVAILABLE
  // (loading or errored) that seed would be [] by accident, silently
  // collapsing the user's legacy full access to an explicit no-access
  // grant — so the Specific option is unclickable until the fetch
  // settles. A loaded-EMPTY list is different: seeding [] is then the
  // only truthful conversion and deliberately stays clickable — it's
  // the admin's only way to revoke a legacy grant (which also covers
  // every FUTURE language) before an org has content. The status line
  // below the options spells out that consequence (#253 review: an
  // earlier draft disabled the empty case too, making legacy access
  // irrevocable in a zero-language org).
  const specificNeedsItems =
    isLegacy && kind === "language" && availableItems === undefined;
  // Shared by the chip-area suppression and the sibling error line so
  // the two can't drift (they must flip together — showing the error
  // AND the stale "Loading…" chip area reads as two states at once).
  const listUnavailable = loadError && availableItems === undefined;
  const listLoaded = availableItems !== undefined;
  const loadingLabel = `Loading ${kind}s…`;
  const emptyLabel = `No ${kind}s defined yet.`;
  const selected = useMemo<Set<string>>(
    () => (Array.isArray(value) ? new Set(value) : new Set()),
    [value]
  );

  const labels = LABELS[kind][verb];
  const radioName = `${kind}-${verb}-rights-mode`;

  const toggleItem = (name: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next].sort());
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{labels.heading}</Label>
        {isLegacy && showLegacyHint && (
          <p className="text-muted-foreground text-xs">
            This user predates verb-based permissions. They currently have full
            access by default. Picking any option below will lock that in
            explicitly.
          </p>
        )}
      </div>

      <fieldset className="space-y-2" disabled={disabled}>
        <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
          <input
            type="radio"
            name={radioName}
            checked={isFull}
            onChange={() => onChange("*")}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Full access</div>
            <div className="text-muted-foreground text-xs">
              {labels.fullDesc}
            </div>
          </div>
        </label>

        <label
          className={cn(
            "flex items-start gap-3 rounded-md border p-3 transition-colors",
            specificNeedsItems
              ? "cursor-not-allowed opacity-60"
              : "hover:bg-accent cursor-pointer"
          )}
        >
          <input
            type="radio"
            name={radioName}
            disabled={specificNeedsItems}
            checked={!isFull && !isLegacy}
            onChange={() => {
              // Hard guard behind the disabled attribute: never seed
              // from an absent list.
              if (specificNeedsItems) return;
              if (isLegacy && kind === "language") {
                // Legacy languages = back-compat full access. Pre-
                // populate the explicit list with every available
                // language so the admin's first "Specific" click
                // PRESERVES the user's current access — they can
                // then uncheck to revoke. Without this seed, the
                // click silently collapses their grant to [] (no
                // access), the literal opposite of what the hint
                // copy promises. Modes don't pre-populate: legacy
                // modes had no per-row rights (admin-only baseline),
                // so [] correctly mirrors the pre-#181 state.
                const all =
                  availableItems?.map((item) => item.name).sort() ?? [];
                onChange(all);
                return;
              }
              onChange([...selected].sort());
            }}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-2">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Specific {kind}s</div>
              <div className="text-muted-foreground text-xs">
                {labels.specificDesc}
              </div>
            </div>

            {!isFull && !isLegacy && !listUnavailable && (
              <div className="flex flex-wrap gap-1.5">
                {availableItems === undefined ? (
                  <span className="text-muted-foreground text-xs">
                    {loadingLabel}
                  </span>
                ) : availableItems.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {emptyLabel}
                  </span>
                ) : (
                  availableItems.map((item) => {
                    const checked = selected.has(item.name);
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => toggleItem(item.name)}
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
                        {item.label || item.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </label>

        {/* Status lines live OUTSIDE the radio's <label>: an interactive
            Retry button inside it would depend on label activation not
            forwarding to the radio — spec-compliant, but not worth
            relying on when a forwarded click would rewrite the rights
            value. Rendered in every radio state, these also explain the
            disabled Specific option for legacy-language users. */}
        {listUnavailable && (
          <span className="text-destructive block text-xs">
            Couldn't load {kind}s.
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="ml-1.5 underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </span>
        )}
        {specificNeedsItems && !loadError && (
          <span className="text-muted-foreground block text-xs">
            {loadingLabel}
          </span>
        )}
        {isLegacy &&
          kind === "language" &&
          listLoaded &&
          availableItems.length === 0 && (
            <span className="text-muted-foreground block text-xs">
              {emptyLabel} Choosing "Specific {kind}s" locks in no access —
              including {kind}s created later.
            </span>
          )}
      </fieldset>

      {Array.isArray(value) && value.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {value.length === 1
            ? `1 ${kind} granted`
            : `${value.length} ${kind}s granted`}
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
