import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { LanguageForbiddenError } from "@/lib/languages-api";
import { slugify } from "@/lib/slug";
import { useSaveLanguage } from "@/hooks/use-languages";
import { useLanguageScaffold } from "@/hooks/use-language-scaffold";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  // Target org for the draft. Parent is responsible for only mounting
  // the panel when the target org is known (non-null) and empty. The
  // panel's scaffold + save mutations bind to this org — never to a
  // fallback — so unmounting-when-null is the parent's fix for the
  // "clear the Org field → silent write to home org" gap.
  org: string;
  // Fires with the engine's canonical slug when the draft PUT succeeds.
  // Parents typically merge this slug into the language rights matrix
  // so the just-bootstrapped draft is granted to the user being
  // created/edited — otherwise a scoped user gets left with `[]` and
  // the exact deadlock #247 targets is reproduced one dialog later.
  onDraftCreated?: (slug: string) => void;
  // Fires when the save mutation transitions in/out of the pending
  // state. Parents disable their outer submit + Cancel + Org input on
  // this so an in-flight bootstrap can't race the user create/update.
  onPendingChange?: (pending: boolean) => void;
}

export function LanguageBootstrapPanel({
  org,
  onDraftCreated,
  onPendingChange,
}: Props) {
  const scaffoldQuery = useLanguageScaffold(org);
  const saveLanguage = useSaveLanguage(org);

  const [expanded, setExpanded] = useState(false);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  const sanitizedSlug = useMemo(() => slugify(slug), [slug]);

  useEffect(() => {
    onPendingChange?.(saveLanguage.isPending);
  }, [saveLanguage.isPending, onPendingChange]);

  // Reset the panel to collapsed if the target org changes underneath
  // us — a partially-typed slug intended for org A must not silently
  // fire against org B if the parent re-renders with a different org.
  useEffect(() => {
    setExpanded(false);
    setSlug("");
    setLabel("");
    setErrorText(null);
  }, [org]);

  const isSubmitReady =
    sanitizedSlug !== "" && !saveLanguage.isPending && scaffoldQuery.isSuccess;

  const submit = () => {
    // The button's disabled state already blocks the invalid paths;
    // this branch surfaces user-friendly messaging when a key handler
    // (Enter) routes here through the disabled UI.
    if (saveLanguage.isPending) return;
    if (sanitizedSlug === "") {
      setErrorText("Enter a slug for the language.");
      return;
    }
    if (!scaffoldQuery.data) {
      setErrorText(
        scaffoldQuery.isError
          ? "Language template couldn't load. Close and reopen the dialog to retry."
          : "Language template is still loading — try again in a moment."
      );
      return;
    }

    setErrorText(null);
    const trimmedLabel = label.trim();
    saveLanguage.mutate(
      {
        name: sanitizedSlug,
        body: {
          label: trimmedLabel || undefined,
          document: scaffoldQuery.data.document,
          published: false,
        },
      },
      {
        onSuccess: () => {
          setExpanded(false);
          setSlug("");
          setLabel("");
          setErrorText(null);
          onDraftCreated?.(sanitizedSlug);
        },
        onError: (err) => {
          if (err instanceof LanguageForbiddenError) {
            setErrorText(
              `You don't have permission to create a language draft in "${org}".`
            );
          } else {
            setErrorText(`Couldn't create the draft: ${err.message}`);
          }
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Enter inside the panel must NOT bubble up to the outer form —
    // parents render this panel inside their <form onSubmit={...}>, so
    // the default browser action would fire the outer submit handler
    // and half-create the user before the draft even lands.
    e.preventDefault();
    submit();
  };

  return (
    <div className="bg-muted/40 space-y-3 rounded-md border border-dashed p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            No language drafts in{" "}
            <span className="font-mono text-xs">{org}</span> yet
          </p>
          <p className="text-muted-foreground text-xs">
            Create the first draft to unlock specific-language grants below. The
            new slug is auto-added to the rights matrix on save — uncheck if you
            don&rsquo;t want it.
          </p>
        </div>
        {!expanded && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setExpanded(true);
              setErrorText(null);
            }}
          >
            <Plus className="mr-1.5 size-3.5" />
            Create draft
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bootstrap-lang-slug" className="text-xs">
                Name (slug)
              </Label>
              <Input
                id="bootstrap-lang-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. indonesian"
                className="h-8 text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bootstrap-lang-label" className="text-xs">
                Display label
              </Label>
              <Input
                id="bootstrap-lang-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Indonesian"
                className="h-8 text-sm"
                autoComplete="off"
              />
            </div>
          </div>
          {!scaffoldQuery.isSuccess && (
            <p
              className={
                scaffoldQuery.isError
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
              role={scaffoldQuery.isError ? "alert" : undefined}
              aria-live="polite"
            >
              {scaffoldQuery.isError
                ? "Couldn't load the language template. Close and reopen the dialog to try again."
                : "Loading language template…"}
            </p>
          )}
          {errorText && (
            <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-xs">
              {errorText}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpanded(false);
                setErrorText(null);
              }}
              disabled={saveLanguage.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={!isSubmitReady}
            >
              {saveLanguage.isPending ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
