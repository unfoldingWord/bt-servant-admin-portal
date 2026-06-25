import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Save } from "lucide-react";
import { useBlocker } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { decideContextChange } from "@/lib/context-org-guard";
import { LanguageForbiddenError } from "@/lib/languages-api";
import {
  filterByAnyRights,
  hasAnyLanguageAccess,
  hasRights,
} from "@/lib/permissions";
import { useUiStore } from "@/lib/ui-store";
import { useDebounced } from "@/hooks/use-debounced";
import {
  useDeleteLanguage,
  useLanguage,
  useLanguages,
  useSaveLanguage,
} from "@/hooks/use-languages";
import { useLanguageScaffold } from "@/hooks/use-language-scaffold";
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
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown-editor";
import { MarkdownToc } from "@/components/markdown-toc";
import { OrgContextSelector } from "@/components/org-context-selector";
import { PageHeader } from "@/components/page-header";

const AUTO_SAVE_DEBOUNCE_MS = 800;

export function LanguagesPage() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const user = useAuthStore((s) => s.user);
  const selectedLanguage = useUiStore((s) => s.selectedLanguage);
  const setSelectedLanguage = useUiStore((s) => s.setSelectedLanguage);
  const showDrafts = useUiStore((s) => s.showDrafts);
  const setShowDrafts = useUiStore((s) => s.setShowDrafts);
  const contextOrg = useUiStore((s) => s.contextOrg);
  const setContextOrg = useUiStore((s) => s.setContextOrg);

  // Cross-org reuses the worker's PR A carve-out: super-admins bypass
  // per-row rights when editing a different org's languages, because
  // shepherd rights are scoped to the user's home org and don't
  // translate to a foreign namespace. Treat both verb rights as "*" in
  // that case so the same filter/gate logic works without a separate
  // cross-org branch.
  //
  // #181: each verb-perm falls back to legacy `language_rights` for pre-
  // PR-1 users, mirroring the worker's rightsFor language logic.
  const isCrossOrg = contextOrg !== null;
  const editRights = isCrossOrg
    ? "*"
    : (user?.language_edit_rights ?? user?.language_rights);
  const publishRights = isCrossOrg
    ? "*"
    : (user?.language_publish_rights ?? user?.language_rights);
  const hasAccess = isCrossOrg || hasAnyLanguageAccess(user);

  // Queries / mutations
  const languagesQuery = useLanguages(contextOrg);
  const languageQuery = useLanguage(selectedLanguage, contextOrg);
  const saveLanguage = useSaveLanguage(contextOrg);
  const deleteLanguage = useDeleteLanguage(contextOrg);
  const scaffoldQuery = useLanguageScaffold(contextOrg);

  // Filter the language list to those the user has any verb on. Union
  // semantic: an edit-only or publish-only grant still surfaces the
  // language (the worker further gates the specific action). Engine
  // #207 will eventually filter server-side too, but until then this
  // is the primary gate against showing forbidden entries in the
  // dropdown.
  const authorizedLanguagesData = useMemo(() => {
    if (!languagesQuery.data) return languagesQuery.data;
    return {
      ...languagesQuery.data,
      languages: filterByAnyRights(
        languagesQuery.data.languages,
        editRights,
        publishRights
      ),
    };
  }, [languagesQuery.data, editRights, publishRights]);

  // Local document draft (auto-save target).
  //
  // We track `lastSyncedDoc` separately from React Query's cache so that:
  //   1. Edits typed *during* an in-flight save are preserved — the cache
  //      isn't authoritative for "what we've actually saved" because it can
  //      lag the real server state.
  //   2. We can reliably detect "is there still something newer to save?"
  //      after a save settles, by comparing draft to lastSyncedDoc.
  //
  // Sync rule: lastSyncedDoc + draft are pulled from the server only when
  // the *selected language changes* (initial load or a switch). After that,
  // lastSyncedDoc only advances when a save we initiated succeeds (set to
  // the value we sent). The cache invalidation that happens after a mutation
  // never overwrites local edits.
  const [draft, setDraft] = useState("");
  const [lastSyncedDoc, setLastSyncedDoc] = useState("");
  // lastSyncedPublished tracks the published flag we *know* the server holds,
  // for the same reason lastSyncedDoc exists: the React Query cache lags
  // saves we just made. Without this, an autosave that fires right after a
  // Publish/Unpublish click reads stale `published` from the cache and the
  // PUT silently reverts the toggle (Frank P2 review of #93).
  const [lastSyncedPublished, setLastSyncedPublished] = useState(false);
  // The most recently autosaved doc that failed. Used to pause autosave on
  // the same draft until the user edits it again or hits Save manually — a
  // failed save would otherwise retry indefinitely (Frank P2 on PR #122),
  // hammering the API and flickering the error banner because TanStack
  // clears `error` while a retry is `pending`.
  const [lastFailedDoc, setLastFailedDoc] = useState<string | null>(null);
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const [activeLine, setActiveLine] = useState(-1);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const debouncedDraft = useDebounced(draft, AUTO_SAVE_DEBOUNCE_MS);

  const serverLabel = languageQuery.data?.label;

  // Re-sync from the server *only* when the selection changes — never
  // post-save. The ref tracks the language whose contents we last loaded
  // into local state, so we don't repeatedly overwrite the draft each time
  // the cache emits.
  const syncedNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedLanguage) {
      syncedNameRef.current = null;
      setDraft("");
      setLastSyncedDoc("");
      setLastSyncedPublished(false);
      setLastFailedDoc(null);
      return;
    }
    // Wait for the query data to arrive AND match the current selection
    // before syncing. Without the name check we'd briefly load stale data
    // for the previously selected language during a switch.
    if (!languageQuery.data) return;
    if (languageQuery.data.name !== selectedLanguage) return;
    if (syncedNameRef.current === selectedLanguage) return;
    setDraft(languageQuery.data.document);
    setLastSyncedDoc(languageQuery.data.document);
    setLastSyncedPublished(languageQuery.data.published ?? false);
    setLastFailedDoc(null);
    syncedNameRef.current = selectedLanguage;
  }, [selectedLanguage, languageQuery.data]);

  const isDirty = draft !== lastSyncedDoc;
  const isSaving = saveLanguage.isPending;
  const hasSelection = selectedLanguage !== null && languageQuery.data;

  // Single save path — both auto-save and the manual Save button funnel
  // through here so the lastSyncedDoc bookkeeping stays consistent.
  // The closure captures the exact `doc` we're sending so onSuccess can
  // bump lastSyncedDoc to that value (not to a re-read of the cache,
  // which may have already moved on if the user kept typing).
  const performSave = useCallback(
    (doc: string) => {
      if (!selectedLanguage) return;
      saveLanguage.mutate(
        {
          name: selectedLanguage,
          body: {
            label: serverLabel,
            document: doc,
            // Read published from local state, not the React Query cache —
            // the cache lags a just-completed Publish/Unpublish PUT, so
            // reading from `serverPublished` here would silently revert it.
            published: lastSyncedPublished,
          },
        },
        {
          onSuccess: () => {
            setLastSyncedDoc(doc);
            setLastFailedDoc(null);
          },
          onError: () => setLastFailedDoc(doc),
        }
      );
    },
    [lastSyncedPublished, saveLanguage, selectedLanguage, serverLabel]
  );

  // Auto-save when debouncedDraft diverges from what we last saved.
  // Re-runs when an in-flight save settles so a "save in progress, user
  // typed more" scenario flushes the newer edits as soon as the first
  // save returns.
  //
  // The `lastFailedDoc` gate pauses autosave for a draft that already
  // failed once — without it, the effect would re-fire as soon as
  // `isPending` flips back to false, putting us in an indefinite retry
  // loop that hammers the API and flickers the error banner. The user
  // recovers by either (a) editing the draft (changes `debouncedDraft`)
  // or (b) clicking Save manually (which routes through `flushSave` and
  // explicitly retries the failed doc).
  useEffect(() => {
    if (!selectedLanguage) return;
    if (saveLanguage.isPending) return;
    if (debouncedDraft === lastSyncedDoc) return;
    if (debouncedDraft === lastFailedDoc) return;
    performSave(debouncedDraft);
  }, [
    debouncedDraft,
    saveLanguage.isPending,
    lastSyncedDoc,
    lastFailedDoc,
    performSave,
    selectedLanguage,
  ]);

  const flushSave = useCallback(() => {
    if (!isDirty || isSaving) return;
    performSave(draft);
  }, [draft, isDirty, isSaving, performSave]);

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
  // Parallel to `pendingSwitch` but at the org-context layer. Outer null
  // means "no pending switch"; outer `{ value: X }` means "user picked X
  // but we're holding it behind a confirmation." `value` itself can be
  // null (= switch back to home org), which is why we wrap rather than
  // use a bare `string | null` (Frank P1, PR #186 review).
  const [pendingContextOrg, setPendingContextOrg] = useState<{
    value: string | null;
  } | null>(null);

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

  const handleRequestContextChange = useCallback(
    (next: string | null) => {
      const outcome = decideContextChange(contextOrg, next, isDirty, isSaving);
      if (outcome === "no-op") return;
      if (outcome === "confirm") {
        setPendingContextOrg({ value: next });
        return;
      }
      setContextOrg(next);
    },
    [contextOrg, isDirty, isSaving, setContextOrg]
  );

  const confirmContextSwitch = useCallback(() => {
    if (!pendingContextOrg) return;
    setContextOrg(pendingContextOrg.value);
    setPendingContextOrg(null);
  }, [pendingContextOrg, setContextOrg]);

  // If the persisted selection is no longer authorized (e.g. an admin
  // revoked rights mid-session, or rights changed since last login), drop
  // it so we don't render an editor for a language the user can't read.
  // Skip the gate under cross-org context: `setContextOrg` already cleared
  // `selectedLanguage` to null when the user switched orgs, and any new
  // selection in cross-org mode is gated server-side via the worker's
  // super-admin carve-out (PR A) rather than by per-row rights. Union
  // semantic: at least one of edit / publish on the row is enough to
  // keep the selection — the worker further gates the specific verb.
  useEffect(() => {
    if (selectedLanguage === null) return;
    if (isCrossOrg) return;
    if (
      hasRights(editRights, selectedLanguage) ||
      hasRights(publishRights, selectedLanguage)
    )
      return;
    setSelectedLanguage(null);
  }, [
    isCrossOrg,
    editRights,
    publishRights,
    selectedLanguage,
    setSelectedLanguage,
  ]);

  const confirmSwitch = useCallback(() => {
    setSelectedLanguage(pendingSwitch);
    setPendingSwitch(null);
  }, [pendingSwitch, setSelectedLanguage]);

  const handleCreateLanguage = useCallback(
    (name: string, label: string) => {
      // Hard gate: never save a blank document. The create button in the
      // selector is also disabled when scaffold isn't ready, but defense
      // in depth — if anything ever programmatically triggers create
      // before scaffold loads (keyboard shortcut, test, debugger), we
      // refuse to save instead of silently committing an empty doc
      // (Frank P2 on PR #106).
      const scaffold = scaffoldQuery.data;
      if (!scaffold) return;
      saveLanguage.mutate(
        {
          name,
          body: {
            label: label || undefined,
            document: scaffold.document,
            published: false,
          },
        },
        { onSuccess: () => setSelectedLanguage(name) }
      );
    },
    [saveLanguage, scaffoldQuery.data, setSelectedLanguage]
  );

  const handleSetPublished = useCallback(
    async (name: string, published: boolean) => {
      // Send the current draft for the selected language so an unsaved doc
      // edit lands in the same request as the publish toggle. Bookkeep both
      // lastSyncedDoc and lastSyncedPublished on success — without the
      // latter, a subsequent autosave would read stale `published` from the
      // cache and revert this toggle.
      //
      // mutateAsync so the selector's destructive-confirmation dialog can
      // await + render inline errors (#102).
      const isSelected = name === selectedLanguage;
      const doc = isSelected ? draft : (languageQuery.data?.document ?? "");
      await saveLanguage.mutateAsync({
        name,
        body: { label: serverLabel, document: doc, published },
      });
      if (isSelected) {
        setLastSyncedDoc(doc);
        setLastSyncedPublished(published);
      }
    },
    [draft, languageQuery.data, saveLanguage, selectedLanguage, serverLabel]
  );

  const handleDeleteLanguage = useCallback(
    async (name: string) => {
      await deleteLanguage.mutateAsync(name);
      if (name === selectedLanguage) setSelectedLanguage(null);
    },
    [deleteLanguage, selectedLanguage, setSelectedLanguage]
  );

  const handleJumpToLine = useCallback((line: number) => {
    editorRef.current?.jumpToLine(line);
  }, []);

  const isLoading =
    languagesQuery.isLoading ||
    (selectedLanguage !== null && languageQuery.isLoading);

  // Separate forbidden errors from generic errors so we can render a
  // permission-specific inline message rather than the raw save-failed text.
  const saveError = saveLanguage.error;
  const deleteError = deleteLanguage.error;
  const loadError =
    languagesQuery.error ||
    (selectedLanguage !== null ? languageQuery.error : null);
  const forbiddenError = useMemo<LanguageForbiddenError | null>(() => {
    if (saveError instanceof LanguageForbiddenError) return saveError;
    if (deleteError instanceof LanguageForbiddenError) return deleteError;
    if (loadError instanceof LanguageForbiddenError) return loadError;
    return null;
  }, [saveError, deleteError, loadError]);
  const error = forbiddenError ? null : loadError;
  // Surface non-forbidden save / delete failures so the user can see *why* a
  // save didn't stick — previously these were silently swallowed, leaving the
  // "Unsaved changes" chip stuck without any explanation.
  const genericMutationError = useMemo<Error | null>(() => {
    if (saveError && !(saveError instanceof LanguageForbiddenError)) {
      return saveError;
    }
    if (deleteError && !(deleteError instanceof LanguageForbiddenError)) {
      return deleteError;
    }
    return null;
  }, [saveError, deleteError]);

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
        variant="languages"
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <OrgContextSelector onRequestChange={handleRequestContextChange} />
          <div className="min-w-0 flex-1">
            <LanguageSelector
              languagesData={authorizedLanguagesData}
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
              isScaffoldReady={scaffoldQuery.isSuccess}
              scaffoldError={scaffoldQuery.isError}
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

      {genericMutationError && (
        <div
          className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm"
          role="alert"
          aria-live="polite"
        >
          Save failed: {genericMutationError.message}
        </div>
      )}

      {forbiddenError && (
        <div
          className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm"
          role="alert"
        >
          {forbiddenError.operation === "write"
            ? `You don't have permission to edit "${forbiddenError.languageName}". Contact your admin to request access.`
            : forbiddenError.operation === "delete"
              ? `You don't have permission to delete "${forbiddenError.languageName}".`
              : `You don't have permission to view "${forbiddenError.languageName}".`}
        </div>
      )}

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={{ background: "var(--editor-paper)" }}
      >
        {!hasAccess ? (
          <NoAccessState />
        ) : isLoading ? (
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
            hasAny={(authorizedLanguagesData?.languages.length ?? 0) > 0}
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
                ref={editorRef}
                value={draft}
                onChange={setDraft}
                onHeadingsChange={setHeadings}
                onActiveLineChange={setActiveLine}
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

      <AlertDialog
        open={pendingContextOrg !== null}
        onOpenChange={(open) => {
          if (!open) setPendingContextOrg(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch org context?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to{" "}
              <span className="text-foreground font-medium">
                &ldquo;{selectedLanguage}&rdquo;
              </span>
              . Switching org context will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingContextOrg(null)}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmContextSwitch}
            >
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

function NoAccessState() {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm">
        You don&rsquo;t have access to any languages. Contact your admin to
        request language-shepherd permissions.
      </p>
    </div>
  );
}
