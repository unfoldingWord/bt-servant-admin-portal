import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Save } from "lucide-react";
import { useBlocker } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import {
  contextSwitchReason,
  decideContextChange,
} from "@/lib/context-org-guard";
import { computeLanguageDefaultState } from "@/lib/language-default-state";
import {
  isDefaultBlockedDeleteError,
  selectLanguageMutationBanner,
} from "@/lib/language-error-surface";
import { LanguageForbiddenError } from "@/lib/languages-api";
import {
  effectiveLanguageEditRights,
  effectiveLanguagePublishRights,
  hasAdminPowers,
  hasAnyLanguageAccess,
  hasAnyRights,
  hasRights,
} from "@/lib/permissions";
import { useUiStore } from "@/lib/ui-store";
import { useDebounced } from "@/hooks/use-debounced";
import {
  useDeleteLanguage,
  useLanguage,
  useLanguages,
  useOrgDefaultLanguage,
  useSaveLanguage,
  useSetOrgDefaultLanguage,
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
  const user = useAuthStore((s) => s.user);
  const selectedLanguage = useUiStore((s) => s.selectedLanguage);
  const setSelectedLanguage = useUiStore((s) => s.setSelectedLanguage);
  const showDrafts = useUiStore((s) => s.showDrafts);
  const setShowDrafts = useUiStore((s) => s.setShowDrafts);
  const contextOrg = useUiStore((s) => s.contextOrg);
  const setContextOrg = useUiStore((s) => s.setContextOrg);

  // Admins and cross-org super-admins bypass per-row rights, so treat
  // both verb rights as "*" for them and let one set of gates serve
  // every caller (mirrors modes.tsx):
  //   - admin (#249): the worker's gate trumps per-row language rights
  //     for anyone with admin powers — rights scope non-admin shepherds,
  //     while admins administer the whole org's language catalog.
  //   - cross-org: shepherd rights are scoped to the user's home org and
  //     don't translate to a foreign namespace (worker PR A carve-out).
  //
  // #181: for non-admin same-org users each verb-perm applies the
  // worker's partner-aware rule (effective* helpers), so a user with
  // `language_rights:"*"` plus only an explicit edit grant sees
  // publish=[] in the UI — matching what the worker sees — not
  // publish="*" via a naive `?? language_rights` fallback (Frank rd-2 P1).
  const isCrossOrg = contextOrg !== null;
  const isAdmin = hasAdminPowers(user);
  const editRights =
    isAdmin || isCrossOrg ? "*" : effectiveLanguageEditRights(user);
  const publishRights =
    isAdmin || isCrossOrg ? "*" : effectiveLanguagePublishRights(user);
  // Zero-rights non-admins still see nothing: #249 scopes org-wide
  // visibility to users who hold at least one verb on at least one row.
  const hasAccess = isCrossOrg || isAdmin || hasAnyLanguageAccess(user);

  // Per-row capability gates passed to LanguageSelector. Admins reach
  // every branch via the "*" short-circuit above.
  const canCreate = hasAnyRights(editRights);
  const canEditSelected =
    selectedLanguage !== null && hasRights(editRights, selectedLanguage);
  const canPublishSelected =
    selectedLanguage !== null && hasRights(publishRights, selectedLanguage);
  const canDeleteSelected = canEditSelected && canPublishSelected;
  // #286 — the org default is one pointer shared by the whole org, so it
  // is admin-only rather than per-row (the worker's PUT gate on
  // /api/config/languages-default enforces the same rule; this is the UI
  // mirror). Cross-org context is super-admin-only, so it carries admin
  // powers by construction.
  const canSetDefault = isAdmin || isCrossOrg;

  // Queries / mutations
  const languagesQuery = useLanguages(contextOrg);
  const languageQuery = useLanguage(selectedLanguage, contextOrg);
  const saveLanguage = useSaveLanguage();
  const deleteLanguage = useDeleteLanguage();
  const scaffoldQuery = useLanguageScaffold(contextOrg);
  // #286 — org default. Its own query rather than the list's
  // `defaultLanguage` echo, because only the dedicated endpoint can tell
  // "no default set" apart from "this worker predates worker#236"; the
  // query resolves (never rejects) on that 404, so a portal running ahead
  // of the worker shows no control instead of an error on page load.
  const orgDefaultQuery = useOrgDefaultLanguage(contextOrg);
  const setOrgDefault = useSetOrgDefaultLanguage();

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

  // Same local-mirror rationale as lastSyncedDoc/Published: the label lives in
  // the React Query cache, which lags a create/overwrite that changed it. An
  // autosave must send the label we KNOW we last synced — not a stale
  // languageQuery.data.label — or a save right after an overwrite that set a
  // new label reverts it (codex rd-2 P2).
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | undefined>(
    undefined
  );

  // Re-sync from the server *only* when the selection changes — never
  // post-save. The ref tracks the language whose contents we last loaded
  // into local state, so we don't repeatedly overwrite the draft each time
  // the cache emits.
  const syncedNameRef = useRef<string | null>(null);
  // A STATE mirror of syncedNameRef, used for render-time gating. The ref gives
  // the sync effect a synchronous guard; the state gives the publish gate a
  // reactive one. A ref alone can't drive render output: switching to a cached
  // language whose document/published/label/failure all equal the current
  // locals makes every setter below a no-op, so nothing re-renders and a
  // ref-derived flag would stay stale forever (codex rd-5).
  const [syncedName, setSyncedName] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedLanguage) {
      syncedNameRef.current = null;
      setSyncedName(null);
      setDraft("");
      setLastSyncedDoc("");
      setLastSyncedPublished(false);
      setLastSyncedLabel(undefined);
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
    setLastSyncedLabel(languageQuery.data.label);
    setLastFailedDoc(null);
    syncedNameRef.current = selectedLanguage;
    setSyncedName(selectedLanguage);
  }, [selectedLanguage, languageQuery.data]);

  const isDirty = draft !== lastSyncedDoc;
  const isSaving = saveLanguage.isPending;
  const hasSelection = selectedLanguage !== null && languageQuery.data;
  // Local editor state is synced to the CURRENT selection. Gate Publish/Unpublish
  // on this, not on `languageQuery.data?.name === selectedLanguage`: a cache HIT
  // makes the query name match on the first render after a switch, before the
  // sync effect above has loaded this language's document/label — so a Publish
  // in that render would send the PREVIOUS language's draft and label into this
  // one (codex rd-4 P1). Read from `syncedName` STATE, not the ref, so an
  // all-no-op sync still re-renders the gate (codex rd-5).
  const detailReady = syncedName === selectedLanguage;

  // Single save path — both auto-save and the manual Save button funnel
  // through here so the lastSyncedDoc bookkeeping stays consistent.
  // The closure captures the exact `doc` we're sending so onSuccess can
  // bump lastSyncedDoc to that value (not to a re-read of the cache,
  // which may have already moved on if the user kept typing).
  const performSave = useCallback(
    (doc: string) => {
      if (!selectedLanguage) return;
      // The row this save targets, pinned at call time. A save that settles
      // after a discard-and-switch must not retarget the NEW selection's
      // shared bookkeeping — check the live selection in the callbacks before
      // touching lastSyncedDoc/lastFailedDoc (grok rd-5).
      const target = selectedLanguage;
      saveLanguage.mutate(
        {
          name: target,
          // Org pinned at call time — see handleSetDefault.
          org: contextOrg,
          body: {
            label: lastSyncedLabel,
            document: doc,
            // Read published from local state, not the React Query cache —
            // the cache lags a just-completed Publish/Unpublish PUT, so
            // reading from `serverPublished` here would silently revert it.
            published: lastSyncedPublished,
          },
        },
        {
          onSuccess: () => {
            if (useUiStore.getState().selectedLanguage !== target) return;
            setLastSyncedDoc(doc);
            setLastFailedDoc(null);
          },
          onError: () => {
            if (useUiStore.getState().selectedLanguage !== target) return;
            setLastFailedDoc(doc);
          },
        }
      );
    },
    [
      contextOrg,
      lastSyncedPublished,
      saveLanguage,
      selectedLanguage,
      lastSyncedLabel,
    ]
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
    // Local editor state must belong to the current selection. On a
    // discard-and-switch the selection flips to B in a render where `draft`,
    // `lastSyncedLabel` and `lastSyncedPublished` are still A's, before the sync
    // effect loads B — saving in that window PUTs A's document onto B (grok
    // rd-5). Same gate the publish control uses.
    if (syncedName !== selectedLanguage) return;
    // A debounced snapshot that hasn't caught up to `draft` is a value from
    // the past — writing it would undo an out-of-band change (an overwrite
    // reset, or a language switch) that already advanced `draft`/lastSyncedDoc.
    // Same refusal the modes editor extracted as `shouldAutoSaveDraft`
    // (lib/autosave-gate) after the priority-panel Apply race; grok rd-2 flagged
    // the identical lag here (overwrite → republish, cross-language draft bleed).
    if (debouncedDraft !== draft) return;
    if (debouncedDraft === lastSyncedDoc) return;
    if (debouncedDraft === lastFailedDoc) return;
    // Frank rd-2 P2: skip autosave when the user has no edit rights on
    // the selected row. Without this gate, a publish-only shepherd's
    // accidental keystroke triggers an autosave that 403s — the
    // editor below is also rendered readOnly so this branch only
    // fires if the gate state changed mid-edit.
    if (!canEditSelected) return;
    performSave(debouncedDraft);
  }, [
    draft,
    debouncedDraft,
    saveLanguage.isPending,
    lastSyncedDoc,
    lastFailedDoc,
    performSave,
    selectedLanguage,
    syncedName,
    canEditSelected,
  ]);

  const flushSave = useCallback(() => {
    if (!isDirty || isSaving) return;
    if (!canEditSelected) return;
    // Same selection-ownership gate as autosave: never flush A's locals onto B
    // during the render window after a discard-and-switch (grok rd-5).
    if (syncedName !== selectedLanguage) return;
    performSave(draft);
  }, [
    canEditSelected,
    draft,
    isDirty,
    isSaving,
    performSave,
    syncedName,
    selectedLanguage,
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
      // In-flight org-scoped writes count as "saving": switching context
      // under one would strand the write's result in another org's view
      // (#286 review P2-3). The hooks pin their target org too, so this
      // guard is the user-visible half of a two-layer fix.
      const outcome = decideContextChange(
        contextOrg,
        next,
        isDirty,
        isSaving || setOrgDefault.isPending || deleteLanguage.isPending
      );
      if (outcome === "no-op") return;
      if (outcome === "confirm") {
        setPendingContextOrg({ value: next });
        return;
      }
      setContextOrg(next);
    },
    [
      contextOrg,
      deleteLanguage.isPending,
      isDirty,
      isSaving,
      setContextOrg,
      setOrgDefault.isPending,
    ]
  );

  // Captured from the state that TRIGGERED the dialog would be ideal, but
  // the flags are stable while it's open (the switch is blocked, so no new
  // writes start), so reading them live is equivalent and simpler.
  const contextSwitchCause = contextSwitchReason(
    isDirty,
    isSaving || setOrgDefault.isPending || deleteLanguage.isPending
  );

  const confirmContextSwitch = useCallback(() => {
    if (!pendingContextOrg) return;
    setContextOrg(pendingContextOrg.value);
    setPendingContextOrg(null);
  }, [pendingContextOrg, setContextOrg]);

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
      // Reject (not a silent resolve) so the destructive overwrite dialog stays
      // open and shows the error instead of closing as if it replaced (grok
      // rd-4). The create button is disabled until the scaffold loads, so this
      // is defense in depth (Frank P2 on PR #106).
      if (!scaffold) {
        return Promise.reject(
          new Error("The language template isn't loaded yet — try again.")
        );
      }
      // Returned so the selector's overwrite confirmation can await the write
      // and render failures inline (grok F2 / #102).
      return saveLanguage
        .mutateAsync({
          name,
          org: contextOrg,
          body: {
            label: label || undefined,
            document: scaffold.document,
            published: false,
          },
        })
        .then(() => {
          // Bail if the ORG context switched during the in-flight PUT: the
          // discard-and-switch dialog nulls selectedLanguage, and treating that
          // as "empty editor, land here" would install org A's scaffold and
          // autosave it onto org B's row (grok rd-6). Only land on the same org.
          if (useUiStore.getState().contextOrg !== contextOrg) return;
          // Read the LIVE selection, not the click-time closure value: the user
          // can switch languages during the in-flight PUT (the switch dialog
          // offers "discard and switch" while saving), and acting on a stale
          // `selectedLanguage` would skip the local install for the row now on
          // screen, or yank the selection off a row they moved to (grok rd-4).
          const liveSelection = useUiStore.getState().selectedLanguage;
          // Never re-scaffold onto a DIFFERENT language while one is open:
          // auto-selecting it would couple the two through the autosave debounce
          // register and could show a stale cache read over the scaffold just
          // written (grok rd-2 F2). Leave the selection put; the new language is
          // in the dropdown either way.
          if (name !== liveSelection && liveSelection !== null) return;
          // Otherwise we are landing on `name` — replacing the language being
          // VIEWED, or selecting the freshly written one from an empty editor.
          // Install the scaffold state locally and PIN syncedNameRef so the sync
          // effect won't overwrite it: without this the next keystroke
          // republishes the old document (grok rd-2 F1), or a stale cache read
          // for a previously-visited language reloads its old doc over the
          // scaffold (codex rd-3 P1). The label is mirrored for the same reason
          // (codex rd-2 P2). (#249 — creation is an ordinary admin write.)
          setDraft(scaffold.document);
          setLastSyncedDoc(scaffold.document);
          setLastSyncedPublished(false);
          setLastSyncedLabel(label || undefined);
          setLastFailedDoc(null);
          syncedNameRef.current = name;
          setSyncedName(name);
          if (name !== liveSelection) setSelectedLanguage(name);
        });
    },
    [contextOrg, saveLanguage, scaffoldQuery.data, setSelectedLanguage]
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
        org: contextOrg,
        body: { label: lastSyncedLabel, document: doc, published },
      });
      // Only bookkeep locals if we're STILL on the row this toggle targeted —
      // a discard-and-switch during the await would otherwise stamp this row's
      // published flag and document onto the newly selected language, which the
      // next autosave then PUTs (grok rd-6). Same live check as performSave.
      if (useUiStore.getState().selectedLanguage === name) {
        setLastSyncedDoc(doc);
        setLastSyncedPublished(published);
      }
    },
    [
      contextOrg,
      draft,
      languageQuery.data,
      saveLanguage,
      selectedLanguage,
      lastSyncedLabel,
    ]
  );

  // #286 — set (`name`) or clear (`null`) the org default. mutateAsync so
  // the selector's clear-confirmation dialog can await it and render its
  // failure inline (#102 pattern), and so the set path can surface its own
  // message without a page-level banner.
  const handleSetDefault = useCallback(
    async (name: string | null) => {
      // `org` is pinned HERE, at click time, and travels with the request:
      // the hook must not read an ambient key when the mutation settles,
      // or an org-context switch mid-flight lands org A's result in org
      // B's cache (#286 review P2-3).
      await setOrgDefault.mutateAsync({ name, org: contextOrg });
      // The delete dialog's 409 ("may be the org default") is exactly the
      // failure this action fixes. Leaving the mutation error in place
      // would keep asserting the block after the block is gone — the
      // sticky-banner path the review found.
      if (isDefaultBlockedDeleteError(deleteLanguage.error)) {
        deleteLanguage.reset();
      }
    },
    [contextOrg, deleteLanguage, setOrgDefault]
  );

  // Both queries feed the state machine, loading flags included: "no
  // default is set" and "the default points at nothing" are claims about
  // the org, and an unresolved read is not evidence for either. `isError`
  // is threaded separately because 404/501 RESOLVE as unsupported — a
  // rejection here is a real failure and must not masquerade as "this
  // worker doesn't have the feature".
  const defaultState = useMemo(
    () =>
      computeLanguageDefaultState({
        orgDefault: orgDefaultQuery.data,
        isPending: orgDefaultQuery.isPending,
        isError: orgDefaultQuery.isError,
        languages: languagesQuery.data?.languages,
      }),
    [
      orgDefaultQuery.data,
      orgDefaultQuery.isPending,
      orgDefaultQuery.isError,
      languagesQuery.data,
    ]
  );

  const handleDeleteLanguage = useCallback(
    async (name: string) => {
      // Org pinned at click time — same reason as handleSetDefault.
      await deleteLanguage.mutateAsync({ name, org: contextOrg });
      if (name === selectedLanguage) setSelectedLanguage(null);
    },
    [contextOrg, deleteLanguage, selectedLanguage, setSelectedLanguage]
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
  // One surface per failure. The org-default 409 is deliberately NOT
  // folded in here: the delete dialog renders it inline and stays open to
  // do so, and a page banner would both duplicate it and outlive it — see
  // src/lib/language-error-surface.ts for the rule and its tests.
  const genericMutationError = useMemo<Error | null>(
    () => selectLanguageMutationBanner(saveError, deleteError),
    [saveError, deleteError]
  );

  // #249 — with the dropdown listing every draft in the org, opening a
  // row you can't edit is an ordinary state rather than an error, so
  // label it instead of showing a save status that will never change.
  const saveStatus = useMemo(() => {
    if (hasSelection && !canEditSelected) return "Read-only";
    if (isSaving) return "Saving…";
    if (isDirty) return "Unsaved changes";
    if (hasSelection) return "Saved";
    return "";
  }, [canEditSelected, hasSelection, isDirty, isSaving]);

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
            {/* #249 — the dropdown lists EVERY draft in the org,
                unfiltered: a shared catalog only some users could see
                is what made drafts look like they had vanished (#247).
                Rows the user holds no edit right on open read-only via
                `canEditSelected`, and the worker gates every write.
                Deliberately wider than modes, which still filter the
                dropdown for non-admin shepherds. */}
            <LanguageSelector
              languagesData={languagesQuery.data}
              selectedLanguage={selectedLanguage}
              onSelectLanguage={handleSelectLanguage}
              onCreateLanguage={handleCreateLanguage}
              editRights={editRights}
              publishRights={publishRights}
              onDeleteLanguage={handleDeleteLanguage}
              onSetPublished={handleSetPublished}
              isCreating={saveLanguage.isPending}
              isDeleting={deleteLanguage.isPending}
              isSettingPublished={saveLanguage.isPending}
              showDrafts={showDrafts}
              onToggleShowDrafts={setShowDrafts}
              canCreate={canCreate}
              canPublishSelected={canPublishSelected && detailReady}
              canDeleteSelected={canDeleteSelected}
              isScaffoldReady={scaffoldQuery.isSuccess}
              scaffoldError={scaffoldQuery.isError}
              defaultState={defaultState}
              canSetDefault={canSetDefault}
              onSetDefault={handleSetDefault}
              isSettingDefault={setOrgDefault.isPending}
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
                disabled={!isDirty || isSaving || !canEditSelected}
                title={
                  canEditSelected
                    ? undefined
                    : "You don't have edit rights on this language."
                }
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
            canCreate={canCreate}
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
                ref={editorRef}
                value={draft}
                onChange={setDraft}
                onHeadingsChange={setHeadings}
                onActiveLineChange={setActiveLine}
                readOnly={!canEditSelected}
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
              {/* #286 rd-2 P3: the guard now also fires for an in-flight
                  org-scoped write (setting the default, deleting), which
                  is not an unsaved edit. Saying "you have unsaved edits"
                  to someone who hasn't typed anything is a false alarm,
                  and false alarms train people to click through. */}
              {contextSwitchCause === "pending-write" ? (
                <>
                  A change to this org is still saving. Switching now leaves it
                  to finish against{" "}
                  <span className="text-foreground font-medium">
                    {contextOrg ?? "your own org"}
                  </span>{" "}
                  while you look at another org.
                </>
              ) : contextSwitchCause === "both" ? (
                <>
                  You have unsaved edits to{" "}
                  <span className="text-foreground font-medium">
                    &ldquo;{selectedLanguage}&rdquo;
                  </span>{" "}
                  and a change that is still saving. Switching org context will
                  discard the edits.
                </>
              ) : (
                <>
                  You have unsaved edits to{" "}
                  <span className="text-foreground font-medium">
                    &ldquo;{selectedLanguage}&rdquo;
                  </span>
                  . Switching org context will discard them.
                </>
              )}
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
  canCreate: boolean;
  /** The org's list has entries. #249 dropped the rights filter, so an
      empty list now means the org genuinely has no drafts — the old
      "drafts exist but are hidden from you" copy is unreachable. */
  hasAny: boolean;
}

function EmptyState({ canCreate, hasAny }: EmptyStateProps) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm">
        {hasAny
          ? "Pick a language above to start editing."
          : canCreate
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
