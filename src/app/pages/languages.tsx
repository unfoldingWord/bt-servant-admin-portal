import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Save } from "lucide-react";
import { useBlocker } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";
import { useDebounced } from "@/hooks/use-debounced";
import { useActiveHeadingLine } from "@/hooks/use-active-heading-line";
import {
  useDeleteLanguage,
  useLanguage,
  useLanguages,
  useSaveLanguage,
} from "@/hooks/use-languages";
import type { MarkdownHeading } from "@/types/markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownToc } from "@/components/markdown-toc";
import { PageHeader } from "@/components/page-header";

const AUTO_SAVE_DEBOUNCE_MS = 800;

export function LanguagesPage() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const selectedLanguage = useUiStore((s) => s.selectedLanguage);
  const setSelectedLanguage = useUiStore((s) => s.setSelectedLanguage);
  const showDrafts = useUiStore((s) => s.showDrafts);
  const setShowDrafts = useUiStore((s) => s.setShowDrafts);

  // Queries / mutations
  const languagesQuery = useLanguages();
  const languageQuery = useLanguage(selectedLanguage);
  const saveLanguage = useSaveLanguage();
  const deleteLanguage = useDeleteLanguage();

  // Local document draft (auto-save target). Synced to the server document
  // whenever the selected language changes or a save lands.
  const [draft, setDraft] = useState("");
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeLine = useActiveHeadingLine(textareaRef, draft, headings);
  const debouncedDraft = useDebounced(draft, AUTO_SAVE_DEBOUNCE_MS);

  const serverDocument = languageQuery.data?.document ?? "";
  const serverLabel = languageQuery.data?.label;
  const serverPublished = languageQuery.data?.published ?? false;

  // Sync the draft from the server when the selected language changes or after
  // a successful save lands. We don't overwrite while a save is in flight to
  // avoid jitter — the next sync happens once the save settles.
  useEffect(() => {
    if (saveLanguage.isPending) return;
    setDraft(serverDocument);
  }, [serverDocument, saveLanguage.isPending]);

  const isDirty = draft !== serverDocument;
  const isSaving = saveLanguage.isPending;
  const hasSelection = selectedLanguage !== null && languageQuery.data;

  // Auto-save when the debounced draft diverges from the server document.
  // Skip while another save is in flight; the next debounce tick will retry.
  useEffect(() => {
    if (!selectedLanguage) return;
    if (saveLanguage.isPending) return;
    if (debouncedDraft === serverDocument) return;
    saveLanguage.mutate({
      name: selectedLanguage,
      body: {
        label: serverLabel,
        document: debouncedDraft,
        published: serverPublished,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only react to debouncedDraft changes
  }, [debouncedDraft]);

  const flushSave = useCallback(() => {
    if (!selectedLanguage) return;
    if (!isDirty) return;
    saveLanguage.mutate({
      name: selectedLanguage,
      body: {
        label: serverLabel,
        document: draft,
        published: serverPublished,
      },
    });
  }, [
    draft,
    isDirty,
    saveLanguage,
    selectedLanguage,
    serverLabel,
    serverPublished,
  ]);

  // Block route changes while there are pending edits or an in-flight save.
  // The blocker fires only when navigating to a different pathname (selecting
  // a different language stays on /languages and is handled separately below).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isSaving) &&
      currentLocation.pathname !== nextLocation.pathname
  );

  // Pending language switch within the same page — guards against losing
  // edits when picking a different language from the dropdown.
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  const handleSelectLanguage = useCallback(
    (next: string | null) => {
      if (next === selectedLanguage) return;
      if (isDirty || isSaving) {
        setPendingSwitch(next);
        return;
      }
      setSelectedLanguage(next);
    },
    [isDirty, isSaving, selectedLanguage, setSelectedLanguage]
  );

  const confirmSwitch = useCallback(() => {
    setSelectedLanguage(pendingSwitch);
    setPendingSwitch(null);
  }, [pendingSwitch, setSelectedLanguage]);

  const handleCreateLanguage = useCallback(
    (name: string, label: string) => {
      saveLanguage.mutate(
        {
          name,
          body: {
            label: label || undefined,
            document: "",
            published: false,
          },
        },
        { onSuccess: () => setSelectedLanguage(name) }
      );
    },
    [saveLanguage, setSelectedLanguage]
  );

  const handleSetPublished = useCallback(
    (name: string, published: boolean) => {
      // Send the current draft so an unsaved doc edit gets included in the
      // same request as the publish toggle. Avoids a separate save→publish
      // race when the user has pending edits.
      saveLanguage.mutate({
        name,
        body: {
          label: serverLabel,
          document: name === selectedLanguage ? draft : serverDocument,
          published,
        },
      });
    },
    [draft, saveLanguage, selectedLanguage, serverDocument, serverLabel]
  );

  const handleDeleteLanguage = useCallback(
    (name: string) => {
      deleteLanguage.mutate(name, {
        onSuccess: () => {
          if (name === selectedLanguage) setSelectedLanguage(null);
        },
      });
    },
    [deleteLanguage, selectedLanguage, setSelectedLanguage]
  );

  const handleJumpToLine = useCallback(
    (line: number) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const lines = draft.split("\n");
      let pos = 0;
      for (let i = 0; i < line; i++) pos += (lines[i]?.length ?? 0) + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      // Scroll the line roughly into view by setting scrollTop based on line height
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || "20");
      ta.scrollTop = Math.max(0, line * lineHeight - 80);
    },
    [draft]
  );

  const isLoading =
    languagesQuery.isLoading ||
    (selectedLanguage !== null && languageQuery.isLoading);
  const error =
    languagesQuery.error ||
    (selectedLanguage !== null ? languageQuery.error : null);

  const saveStatus = useMemo(() => {
    if (isSaving) return "Saving…";
    if (isDirty) return "Unsaved changes";
    if (hasSelection) return "Saved";
    return "";
  }, [hasSelection, isDirty, isSaving]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Languages"
        subtitle="Edit per-language tuning documents. Auto-saves as you type; use Save to flush immediately."
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <div className="min-w-0 flex-1">
            <LanguageSelector
              languagesData={languagesQuery.data}
              selectedLanguage={selectedLanguage}
              onSelectLanguage={handleSelectLanguage}
              onCreateLanguage={handleCreateLanguage}
              onDeleteLanguage={handleDeleteLanguage}
              onSetPublished={handleSetPublished}
              isCreating={saveLanguage.isPending}
              isDeleting={deleteLanguage.isPending}
              isSettingPublished={saveLanguage.isPending}
              showDrafts={showDrafts}
              onToggleShowDrafts={setShowDrafts}
              isAdmin={isAdmin}
            />
          </div>

          {hasSelection && (
            <div className="flex shrink-0 items-center gap-3">
              <span
                className="text-muted-foreground text-xs tabular-nums"
                aria-live="polite"
              >
                {saveStatus}
              </span>
              <Button
                size="sm"
                onClick={flushSave}
                disabled={!isDirty || isSaving}
              >
                <Save className="mr-1.5 size-3.5" />
                Save
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm">
          {error.message}
        </div>
      )}

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ background: "var(--editor-paper)" }}
      >
        {isLoading ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="size-5 animate-spin"
            />
            <p className="text-sm">Loading languages…</p>
          </div>
        ) : !hasSelection ? (
          <EmptyState
            isAdmin={isAdmin}
            hasAny={(languagesQuery.data?.languages.length ?? 0) > 0}
          />
        ) : (
          <>
            <MarkdownToc
              headings={headings}
              activeLine={activeLine}
              onJump={handleJumpToLine}
            />
            <div className="min-w-0 flex-1 overflow-y-auto">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                onHeadingsChange={setHeadings}
                textareaRef={textareaRef}
              />
            </div>
          </>
        )}
      </div>

      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have edits that haven&rsquo;t finished saving. Leaving now may
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch language?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to{" "}
              <span className="text-foreground font-medium">
                &ldquo;{selectedLanguage}&rdquo;
              </span>
              . Switching will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSwitch(null)}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmSwitch}>
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface EmptyStateProps {
  isAdmin: boolean;
  hasAny: boolean;
}

function EmptyState({ isAdmin, hasAny }: EmptyStateProps) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm">
        {hasAny
          ? "Pick a language above to start editing."
          : isAdmin
            ? "No languages yet. Create one to get started."
            : "No languages are available for your account."}
      </p>
    </div>
  );
}
