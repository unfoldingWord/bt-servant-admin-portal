import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Save } from "lucide-react";
import { useBlocker } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { MODE_DOCUMENT_SCAFFOLD } from "@/lib/mode-scaffold";
import { useUiStore } from "@/lib/ui-store";
import { useDebounced } from "@/hooks/use-debounced";
import { useActiveHeadingLine } from "@/hooks/use-active-heading-line";
import {
  useDeleteMode,
  useMode,
  useModes,
  useSaveMode,
} from "@/hooks/use-prompt-config";
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
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownToc } from "@/components/markdown-toc";
import { ModeSelector } from "@/components/mode-selector";
import { PageHeader } from "@/components/page-header";

const AUTO_SAVE_DEBOUNCE_MS = 800;

export function ModesPage() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const selectedMode = useUiStore((s) => s.selectedMode);
  const setSelectedMode = useUiStore((s) => s.setSelectedMode);
  const showDrafts = useUiStore((s) => s.showDrafts);
  const setShowDrafts = useUiStore((s) => s.setShowDrafts);

  const modesQuery = useModes();
  const modeQuery = useMode(selectedMode);
  const saveMode = useSaveMode();
  const deleteMode = useDeleteMode();

  // Local document draft (auto-save target).
  //
  // We track `lastSyncedDoc` / `lastSyncedPublished` separately from the
  // React Query cache so that edits typed *during* an in-flight save are
  // preserved, and so a subsequent autosave after Publish/Unpublish doesn't
  // read stale `published` from the cache and silently revert the toggle.
  // Sync rule: pulled from the server only on selection change; advanced on
  // successful save with the value we sent (never re-read from the cache).
  // See `src/app/pages/languages.tsx` for the parallel implementation —
  // both pages share this pattern.
  const [draft, setDraft] = useState("");
  const [lastSyncedDoc, setLastSyncedDoc] = useState("");
  const [lastSyncedPublished, setLastSyncedPublished] = useState(false);
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeLine = useActiveHeadingLine(textareaRef, draft, headings);
  const debouncedDraft = useDebounced(draft, AUTO_SAVE_DEBOUNCE_MS);

  const serverLabel = modeQuery.data?.label;
  const serverDescription = modeQuery.data?.description;

  const syncedNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMode) {
      syncedNameRef.current = null;
      setDraft("");
      setLastSyncedDoc("");
      setLastSyncedPublished(false);
      return;
    }
    if (!modeQuery.data) return;
    if (modeQuery.data.name !== selectedMode) return;
    if (syncedNameRef.current === selectedMode) return;
    setDraft(modeQuery.data.document);
    setLastSyncedDoc(modeQuery.data.document);
    setLastSyncedPublished(modeQuery.data.published ?? false);
    syncedNameRef.current = selectedMode;
  }, [selectedMode, modeQuery.data]);

  const isDirty = draft !== lastSyncedDoc;
  const isSaving = saveMode.isPending;
  const hasSelection = selectedMode !== null && modeQuery.data;

  const performSave = useCallback(
    (doc: string) => {
      if (!selectedMode) return;
      saveMode.mutate(
        {
          name: selectedMode,
          body: {
            label: serverLabel,
            description: serverDescription,
            document: doc,
            published: lastSyncedPublished,
          },
        },
        { onSuccess: () => setLastSyncedDoc(doc) }
      );
    },
    [
      lastSyncedPublished,
      saveMode,
      selectedMode,
      serverDescription,
      serverLabel,
    ]
  );

  useEffect(() => {
    if (!selectedMode) return;
    if (saveMode.isPending) return;
    if (debouncedDraft === lastSyncedDoc) return;
    performSave(debouncedDraft);
  }, [
    debouncedDraft,
    saveMode.isPending,
    lastSyncedDoc,
    performSave,
    selectedMode,
  ]);

  const flushSave = useCallback(() => {
    if (!isDirty || isSaving) return;
    performSave(draft);
  }, [draft, isDirty, isSaving, performSave]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isSaving) &&
      currentLocation.pathname !== nextLocation.pathname
  );

  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  const handleSelectMode = useCallback(
    (next: string | null) => {
      if (next === selectedMode) return;
      if (isDirty || isSaving) {
        setPendingSwitch(next);
        return;
      }
      setSelectedMode(next);
    },
    [isDirty, isSaving, selectedMode, setSelectedMode]
  );

  const confirmSwitch = useCallback(() => {
    setSelectedMode(pendingSwitch);
    setPendingSwitch(null);
  }, [pendingSwitch, setSelectedMode]);

  // Drop a stale `selectedMode` if it's no longer present in the list (admin
  // deleted it, or the value persisted across a user switch on the same tab).
  // Mirrors the parallel guard in `languages.tsx` and is defense-in-depth
  // alongside `use-auth.ts` resetting the UI store on every login (#116).
  useEffect(() => {
    if (selectedMode === null) return;
    if (!modesQuery.data) return;
    if (modesQuery.data.modes.some((m) => m.name === selectedMode)) return;
    setSelectedMode(null);
  }, [selectedMode, modesQuery.data, setSelectedMode]);

  const handleCreateMode = useCallback(
    (name: string, label: string, description: string) => {
      saveMode.mutate(
        {
          name,
          body: {
            label: label || undefined,
            description: description || undefined,
            document: MODE_DOCUMENT_SCAFFOLD,
            published: false,
          },
        },
        { onSuccess: () => setSelectedMode(name) }
      );
    },
    [saveMode, setSelectedMode]
  );

  const handleSetPublished = useCallback(
    async (name: string, published: boolean) => {
      // Selector only renders publish/unpublish for the currently-selected
      // mode, so we always send the current draft. The worker contract
      // requires a `document` on every PUT — there's no partial-update path.
      if (name !== selectedMode) return;
      await saveMode.mutateAsync({
        name,
        body: {
          label: serverLabel,
          description: serverDescription,
          document: draft,
          published,
        },
      });
      setLastSyncedDoc(draft);
      setLastSyncedPublished(published);
    },
    [draft, saveMode, selectedMode, serverDescription, serverLabel]
  );

  const handleDeleteMode = useCallback(
    async (name: string) => {
      await deleteMode.mutateAsync(name);
      if (name === selectedMode) setSelectedMode(null);
    },
    [deleteMode, selectedMode, setSelectedMode]
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
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || "20");
      ta.scrollTop = Math.max(0, line * lineHeight - 80);
    },
    [draft]
  );

  const isLoading =
    modesQuery.isLoading || (selectedMode !== null && modeQuery.isLoading);

  const error =
    modesQuery.error || (selectedMode !== null ? modeQuery.error : null);
  const saveError = saveMode.error ?? deleteMode.error;

  const saveStatus = useMemo(() => {
    if (isSaving) return "Saving…";
    if (isDirty) return "Unsaved changes";
    if (hasSelection) return "Saved";
    return "";
  }, [hasSelection, isDirty, isSaving]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Modes"
        subtitle="Edit prompt modes as a single markdown document. Auto-saves as you type; use Save to flush immediately."
        variant="modes"
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <div className="min-w-0 flex-1">
            <ModeSelector
              modesData={modesQuery.data}
              selectedMode={selectedMode}
              onSelectMode={handleSelectMode}
              onCreateMode={handleCreateMode}
              onDeleteMode={handleDeleteMode}
              onSetPublished={handleSetPublished}
              isCreating={saveMode.isPending}
              isDeleting={deleteMode.isPending}
              isSettingPublished={saveMode.isPending}
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
        <div
          className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {saveError && (
        <div
          className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm"
          role="alert"
          aria-live="polite"
        >
          Save failed: {saveError.message}
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
            <p className="text-sm">Loading modes…</p>
          </div>
        ) : !hasSelection ? (
          <EmptyState hasAny={(modesQuery.data?.modes.length ?? 0) > 0} />
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
            <AlertDialogTitle>Switch mode?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to{" "}
              <span className="text-foreground font-medium">
                &ldquo;{selectedMode}&rdquo;
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
  hasAny: boolean;
}

function EmptyState({ hasAny }: EmptyStateProps) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm">
        {hasAny
          ? "Pick a mode above to start editing."
          : "No modes yet. Create one to get started."}
      </p>
    </div>
  );
}
