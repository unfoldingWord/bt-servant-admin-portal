import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Download, Save } from "lucide-react";
import { useBlocker } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { decideContextChange } from "@/lib/context-org-guard";
import { CloneCollisionError, type CloneModeResult } from "@/lib/config-api";
import {
  buildModeExportContent,
  buildModeExportFilename,
} from "@/lib/mode-export";
import { MODE_DOCUMENT_SCAFFOLD } from "@/lib/mode-scaffold";
import { humanizeModeSlug, slugifyModeName } from "@/lib/mode-slug";
import { runConfirmedAction } from "@/lib/run-confirmed-action";
import {
  effectiveModeEditRights,
  renameSlugInRights,
  effectiveModePublishRights,
  filterByAnyRights,
  hasAdminPowers,
  hasAnyRights,
  hasRights,
  mirrorModeGrant,
} from "@/lib/permissions";
import { useUiStore } from "@/lib/ui-store";
import { OrgContextSelector } from "@/components/org-context-selector";
import { useDebounced } from "@/hooks/use-debounced";
import {
  useCloneMode,
  useDeleteMode,
  useMode,
  useModes,
  useRenameMode,
  useRetireMode,
  useSaveMode,
} from "@/hooks/use-prompt-config";
import type { MarkdownHeading } from "@/types/markdown";
import type { PromptMode } from "@/types/prompt-override";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown-editor";
import { MarkdownToc } from "@/components/markdown-toc";
import { ModeSelector } from "@/components/mode-selector";
import { PageHeader } from "@/components/page-header";

const AUTO_SAVE_DEBOUNCE_MS = 800;

export function ModesPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isAdmin = hasAdminPowers(user);
  const homeOrg = useAuthStore((s) => s.user?.org);
  const selectedMode = useUiStore((s) => s.selectedMode);
  const setSelectedMode = useUiStore((s) => s.setSelectedMode);
  const showDrafts = useUiStore((s) => s.showDrafts);
  const setShowDrafts = useUiStore((s) => s.setShowDrafts);
  const contextOrg = useUiStore((s) => s.contextOrg);
  const setContextOrg = useUiStore((s) => s.setContextOrg);

  // Effective mode verb-perms. Modes carry an admin trump (worker
  // bypasses per-mode gate for admins) and a cross-org bypass (super-
  // admin viewing another org sees everything; their home-org mode
  // rights don't translate). Both bypasses surface as "*" so the same
  // filter/gate logic works without separate code paths. For non-
  // admin same-org users the effective helpers apply the worker's
  // partner-aware rule (one explicit verb makes the unset partner
  // [], not legacy back-compat — Frank rd-2 P1).
  const isCrossOrg = contextOrg !== null;
  const modeEditRights =
    isAdmin || isCrossOrg ? "*" : effectiveModeEditRights(user);
  const modePublishRights =
    isAdmin || isCrossOrg ? "*" : effectiveModePublishRights(user);

  const modesQuery = useModes(contextOrg);
  const modeQuery = useMode(selectedMode, contextOrg);
  const saveMode = useSaveMode(contextOrg);
  const deleteMode = useDeleteMode(contextOrg);
  const renameMode = useRenameMode(contextOrg);
  const cloneMode = useCloneMode(contextOrg);
  const retireMode = useRetireMode(contextOrg);

  // Filter modes to those the user has any verb on (admin/cross-org
  // sees everything via the `*` short-circuit above). Mirrors
  // languages.tsx — without this, the dropdown lists modes the user
  // can't act on and the editor 403s on autosave (Frank P2).
  const authorizedModesData = useMemo(() => {
    if (!modesQuery.data) return modesQuery.data;
    return {
      ...modesQuery.data,
      modes: filterByAnyRights(
        modesQuery.data.modes,
        modeEditRights,
        modePublishRights
      ),
    };
  }, [modesQuery.data, modeEditRights, modePublishRights]);

  // Per-row capability gates passed to ModeSelector + used for
  // editor/save gating.
  const canCreate = hasAnyRights(modeEditRights);
  const canEditSelected =
    selectedMode !== null && hasRights(modeEditRights, selectedMode);
  const canPublishSelected =
    selectedMode !== null && hasRights(modePublishRights, selectedMode);
  const canDeleteSelected = canEditSelected && canPublishSelected;
  // Rename opens to shepherds with EDIT rights on the row (#240): the
  // worker now migrates per-user `mode_*_rights` old-slug→new-slug
  // around the engine rename, so a shepherd renaming their own mode
  // keeps access to the renamed slug. Mirrors the worker gate (admin /
  // cross-org / edit-on-source). isAdmin/isCrossOrg are implied by
  // canEditSelected here (both resolve modeEditRights to "*") but stay
  // explicit to keep the gate's intent readable.
  const canRenameSelected = isAdmin || isCrossOrg || canEditSelected;
  // Clone opens to shepherds with EDIT rights on the source (#257) —
  // rename parity. The worker auto-grants the cloner both verbs on the
  // new slug (X-Bootstrap-Grant), so the clone no longer lands on a
  // mode its creator can't edit; handleCloneMode mirrors that grant
  // into the session user.
  const canCloneSelected = isAdmin || isCrossOrg || canEditSelected;
  // Retire opens to shepherds at DELETE parity on the source (#257):
  // edit + publish, same as canDeleteSelected — retire is strictly more
  // destructive than delete. The worker additionally requires EDIT on
  // the CANONICAL forward target (its alias set is being widened);
  // the retire dialog mirrors that by filtering target options through
  // canEditModeName below.
  const canRetireSelected = isAdmin || isCrossOrg || canDeleteSelected;
  // Per-row edit predicate for the retire dialog's target list.
  // modeEditRights already resolves to "*" for admin/cross-org, so a
  // plain hasRights read mirrors the worker's target gate.
  const canEditModeName = useCallback(
    (name: string) => hasRights(modeEditRights, name),
    [modeEditRights]
  );

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
  const [lastSyncedRequiresGroup, setLastSyncedRequiresGroup] = useState(false);
  // Pauses autosave on a draft that already failed once, so a failed save
  // doesn't loop on every isPending → false transition (Frank P2 on
  // PR #122). User recovers by editing further (changes debouncedDraft) or
  // by clicking Save manually (which routes through `flushSave`).
  const [lastFailedDoc, setLastFailedDoc] = useState<string | null>(null);
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const [activeLine, setActiveLine] = useState(-1);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
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
      setLastSyncedRequiresGroup(false);
      setLastFailedDoc(null);
      return;
    }
    if (!modeQuery.data) return;
    if (modeQuery.data.name !== selectedMode) return;
    if (syncedNameRef.current === selectedMode) return;
    setDraft(modeQuery.data.document);
    setLastSyncedDoc(modeQuery.data.document);
    setLastSyncedPublished(modeQuery.data.published ?? false);
    setLastSyncedRequiresGroup(modeQuery.data.requires_group ?? false);
    setLastFailedDoc(null);
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
            requires_group: lastSyncedRequiresGroup,
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
    [
      lastSyncedPublished,
      lastSyncedRequiresGroup,
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
    if (debouncedDraft === lastFailedDoc) return;
    // Frank rd-2 P2: skip autosave when the user has no edit rights on
    // the selected mode. The editor below is also rendered readOnly,
    // so this branch only fires if the gate state changed mid-edit.
    if (!canEditSelected) return;
    performSave(debouncedDraft);
  }, [
    debouncedDraft,
    saveMode.isPending,
    lastSyncedDoc,
    lastFailedDoc,
    performSave,
    selectedMode,
    canEditSelected,
  ]);

  const flushSave = useCallback(() => {
    if (!isDirty || isSaving) return;
    if (!canEditSelected) return;
    performSave(draft);
  }, [canEditSelected, draft, isDirty, isSaving, performSave]);

  // Export captures what's currently on screen — draft (including unsaved
  // edits) + last-synced metadata. The export's `org` is the effective
  // context (cross-org if a super-admin has switched orgs; otherwise the
  // caller's home org).
  const effectiveOrg = contextOrg ?? homeOrg ?? null;
  const handleExport = useCallback(() => {
    if (!selectedMode || !modeQuery.data || !effectiveOrg) return;
    // Single `Date` instance so the frontmatter `exported_at` and the
    // filename timestamp can never drift by a second across the call.
    const ctx = { org: effectiveOrg, exportedAt: new Date() };
    // Spread `modeQuery.data` so every PromptMode field (label,
    // description, aliases, and anything added later) flows through
    // without a per-field update here. The overrides below are
    // intentional: `name` follows the user's selection, `document`
    // captures unsaved edits, `published` and `requires_group` use the
    // locally-tracked toggles (not cache, which can be stale during a
    // Publish/toggle race). Original inline construction dropped
    // `aliases` silently — #241 PR A Frank review.
    const content = buildModeExportContent(
      {
        ...modeQuery.data,
        name: selectedMode,
        document: draft,
        published: lastSyncedPublished,
        requires_group: lastSyncedRequiresGroup,
      },
      ctx
    );
    const filename = buildModeExportFilename(
      { name: selectedMode, document: draft },
      ctx
    );
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [
    draft,
    effectiveOrg,
    lastSyncedPublished,
    lastSyncedRequiresGroup,
    modeQuery.data,
    selectedMode,
  ]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (isDirty || isSaving) &&
      currentLocation.pathname !== nextLocation.pathname
  );

  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  // Parallel to `pendingSwitch` but at the org-context layer. Outer null
  // means "no pending switch"; outer `{ value: X }` means "user picked X
  // but we're holding it behind a confirmation." `value` itself can be
  // null (= switch back to home org), which is why we wrap rather than
  // use a bare `string | null` (Frank P1, PR #186 review).
  const [pendingContextOrg, setPendingContextOrg] = useState<{
    value: string | null;
  } | null>(null);

  // #260 — post-rename display-name sync prompt. Holds the rename
  // response (server truth for label/description/document/published) so
  // the follow-up label PUT never depends on refetch timing. Null =
  // no prompt showing.
  const [labelSync, setLabelSync] = useState<PromptMode | null>(null);
  const [labelSyncValue, setLabelSyncValue] = useState("");
  const [labelSyncError, setLabelSyncError] = useState<string | null>(null);

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

  // #181 Frank P2: drop the selection if the user has no verb-perm on
  // the row. Without this gate, a non-admin shepherd with
  // `mode_edit_rights: ["spoken"]` could carry a persisted selection
  // of "written" across a refresh and see the editor render — only to
  // have autosave 403. Union semantic: at least one verb on the row
  // is enough to render (the worker further gates the specific
  // action). Skip under admin/cross-org (the `*` short-circuit above).
  useEffect(() => {
    if (selectedMode === null) return;
    if (
      hasRights(modeEditRights, selectedMode) ||
      hasRights(modePublishRights, selectedMode)
    )
      return;
    setSelectedMode(null);
  }, [selectedMode, modeEditRights, modePublishRights, setSelectedMode]);

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
          requires_group: lastSyncedRequiresGroup,
        },
      });
      setLastSyncedDoc(draft);
      setLastSyncedPublished(published);
    },
    [
      draft,
      lastSyncedRequiresGroup,
      saveMode,
      selectedMode,
      serverDescription,
      serverLabel,
    ]
  );

  // #209 — immediate-save toggle, mirroring handleSetPublished: the
  // worker contract has no partial update, so the current draft rides
  // along and both last-synced trackers advance on success. A failure
  // surfaces through the page-level saveError banner, and the switch
  // visually reverts on its own because it renders from
  // lastSyncedRequiresGroup (not advanced on error).
  const handleSetRequiresGroup = useCallback(
    async (requiresGroup: boolean) => {
      if (!selectedMode) return;
      await saveMode.mutateAsync({
        name: selectedMode,
        body: {
          label: serverLabel,
          description: serverDescription,
          document: draft,
          published: lastSyncedPublished,
          requires_group: requiresGroup,
        },
      });
      setLastSyncedDoc(draft);
      setLastSyncedRequiresGroup(requiresGroup);
    },
    [
      draft,
      lastSyncedPublished,
      saveMode,
      selectedMode,
      serverDescription,
      serverLabel,
    ]
  );

  const handleDeleteMode = useCallback(
    async (name: string) => {
      await deleteMode.mutateAsync(name);
      if (name === selectedMode) setSelectedMode(null);
    },
    [deleteMode, selectedMode, setSelectedMode]
  );

  const handleCloneMode = useCallback(
    async (name: string, newName: string, newLabel: string) => {
      // Only send `newLabel` when the user typed one — the dialog
      // starts blank (no prefill) so blank always means "unset". This
      // sidesteps the empty-vs-inherit ambiguity flagged in the F7
      // review comment: the engine never sees a bare `""` that could
      // be interpreted as either "user cleared" or "unset".
      const trimmedLabel = newLabel.trim();
      let data: CloneModeResult;
      try {
        data = await cloneMode.mutateAsync({
          name,
          newName,
          newLabel: trimmedLabel ? trimmedLabel : undefined,
        });
      } catch (err) {
        // #258 rd-2 P2 — a collision carrying granted verbs means a
        // prior attempt's engine create committed while its response
        // was lost: the auto-grant was kept, and the colliding mode is
        // OURS but invisible to the stale session snapshot. Mirror the
        // header's verbs (server truth) before rethrowing so the mode
        // surfaces in the selector; the dialog still shows the
        // collision message.
        if (err instanceof CloneCollisionError && err.grantedVerbs) {
          const current = useAuthStore.getState().user;
          if (current) {
            setUser(
              mirrorModeGrant(current, newName.trim(), err.grantedVerbs.publish)
            );
          }
        }
        throw err;
      }
      // Route through handleSelectMode (not raw setSelectedMode) so
      // the switch-guard fires if the source draft dirtied while the
      // modal was open. The Clone button is disabled up-front by
      // `cloneDisabledReason` when isDirty || isSaving, but that only
      // gates the trigger — once the dialog is open, focus can leak
      // (click outside the modal, tab out, blur-and-refocus), the
      // user can type in the editor, and `isDirty` can flip to true
      // by the time they confirm. `handleSelectMode` inspects the
      // live isDirty and either switches (clean → setSelectedMode) or
      // queues a `pendingSwitch` confirmation dialog (dirty → user
      // picks discard-or-cancel). Uses data.name so an engine slug
      // canonicalization is picked up too. Belt-and-suspenders for
      // Frank F1 on #241 PR B.
      //
      // #257 — a shepherd clone comes back with bootstrapGranted: the
      // worker granted this user both verbs on the new slug, but the
      // auth store still holds pre-grant rights and the per-row gates
      // + dropdown filter read from it. Mirror the grant synchronously
      // (same pattern and rationale as the #240 rename mirror below:
      // /me re-reads eventually-consistent KV and could clobber the
      // patch with the pre-grant snapshot). Keyed on the newName we
      // sent — that is exactly what the worker granted; data.name is
      // used only for selection.
      if (data.grantedVerbs) {
        const current = useAuthStore.getState().user;
        // The header names the verbs the caller now holds on the new
        // slug — mirror exactly those (server truth; replaces the
        // client-side source-rights recomputation, #258 rd-2).
        if (current)
          setUser(
            mirrorModeGrant(current, newName.trim(), data.grantedVerbs.publish)
          );
      }
      handleSelectMode(data.name);
    },
    [cloneMode, handleSelectMode, setUser]
  );

  const handleRetireMode = useCallback(
    async (name: string, forwardTo: string) => {
      const data = await retireMode.mutateAsync({ name, forwardTo });
      // Route through handleSelectMode so the switch-guard fires if
      // the source draft dirtied while the modal was open (same
      // reasoning as handleCloneMode — leaky focus race). Selection
      // moves to the TARGET because the source is gone; `data.name`
      // is the engine-canonical target slug.
      handleSelectMode(data.name);
    },
    [handleSelectMode, retireMode]
  );

  const handleRenameMode = useCallback(
    async (name: string, newName: string) => {
      const renamed = await renameMode.mutateAsync({ name, newName });
      // #240: the worker migrated this user's stored mode_*_rights to
      // the new slug, but the Zustand auth store still holds the login-
      // time snapshot with the OLD slug — the per-row rights guard and
      // the dropdown filter would hide the just-renamed mode. Patch the
      // store SYNCHRONOUSLY (a local mirror of the worker's migration)
      // so no render ever sees the fresh list paired with stale rights.
      // An awaited /me here would reopen exactly that window: the list
      // cache already swapped slugs in useRenameMode.onSuccess, and the
      // stale-selection guard would null the selection mid-round-trip,
      // blanking the editor (rd-3 review).
      const current = useAuthStore.getState().user;
      if (current) {
        setUser({
          ...current,
          mode_edit_rights: renameSlugInRights(
            current.mode_edit_rights,
            name,
            newName
          ),
          mode_publish_rights: renameSlugInRights(
            current.mode_publish_rights,
            name,
            newName
          ),
        });
      }
      // Follow the selection to the new slug DIRECTLY — deliberately
      // NOT via handleSelectMode, unlike clone/retire (rd-4 review).
      // Their switch-guard protects a still-existing source row; after
      // a rename the old slug is gone from the list cache and the
      // stale-selection guard nulls it regardless, so deferring to a
      // "Switch mode?" dialog offers a "Stay" that cannot be honored.
      // The rename dialog is dirty-gated upstream (renameDisabledReason)
      // — a draft dirtied through the focus-leak window re-syncs under
      // the renamed identity, same as main's pre-#240 behavior.
      if (name === selectedMode) setSelectedMode(newName);
      // No server true-up here: /me re-reads KV, which is eventually
      // consistent — a racing read could return the PRE-migration
      // snapshot and clobber the exact patch above (rd-4 review). The
      // local patch mirrors the worker's migration; the next full page
      // load reconciles any residual drift.

      // #260 — rename only touches the slug, so a mode with a display
      // label looks unchanged in the label-only dropdown afterwards
      // (the confusion behind Elsy's #232 staging report). Offer to
      // bring the label along. Skipped when there is no label (the
      // display already follows the slug) or when the label already
      // slugifies to the new slug (nothing has drifted).
      if (renamed.label && slugifyModeName(renamed.label) !== renamed.name) {
        setLabelSyncValue(humanizeModeSlug(renamed.name));
        setLabelSyncError(null);
        setLabelSync(renamed);
      }
    },
    [renameMode, selectedMode, setSelectedMode, setUser]
  );

  // #260 — confirm handler for the display-name sync prompt. The PUT
  // body comes from the rename response held in `labelSync`: the worker
  // contract has no partial update (every PUT carries the full
  // document), and the response is server truth that cannot be dirtied
  // while the modal is open. Same inline-error/manual-close dialog
  // contract as the selector's destructive confirms (#102).
  const handleConfirmLabelSync = useCallback(() => {
    if (!labelSync) return;
    const nextLabel = labelSyncValue.trim();
    if (!nextLabel) {
      setLabelSyncError("Enter a display name, or keep the current one.");
      return;
    }
    return runConfirmedAction(
      () =>
        saveMode.mutateAsync({
          name: labelSync.name,
          body: {
            label: nextLabel,
            description: labelSync.description,
            document: labelSync.document,
            published: labelSync.published ?? false,
            requires_group: labelSync.requires_group,
          },
        }),
      setLabelSyncError,
      () => {
        setLabelSync(null);
        setLabelSyncValue("");
      },
      "Failed to update the display name."
    );
  }, [labelSync, labelSyncValue, saveMode]);

  const handleJumpToLine = useCallback((line: number) => {
    editorRef.current?.jumpToLine(line);
  }, []);

  const isLoading =
    modesQuery.isLoading || (selectedMode !== null && modeQuery.isLoading);

  const error =
    modesQuery.error || (selectedMode !== null ? modeQuery.error : null);
  // Clone AND retire errors are NOT folded in here — both dialogs
  // surface engine 400/404/409 messages inline via `runConfirmedAction`,
  // so a page-level "Save failed:" banner would be both redundant AND
  // misleading (neither is a save). #241 PR B Frank F3; retire matches
  // the same policy on introduction (#241 PR C).
  const saveError = saveMode.error ?? deleteMode.error ?? renameMode.error;

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
          <OrgContextSelector onRequestChange={handleRequestContextChange} />
          <div className="min-w-0 flex-1">
            <ModeSelector
              modesData={authorizedModesData}
              selectedMode={selectedMode}
              onSelectMode={handleSelectMode}
              onCreateMode={handleCreateMode}
              onDeleteMode={handleDeleteMode}
              onSetPublished={handleSetPublished}
              onRenameMode={handleRenameMode}
              onCloneMode={handleCloneMode}
              onRetireMode={handleRetireMode}
              canEditTargetMode={canEditModeName}
              isCreating={saveMode.isPending}
              isDeleting={deleteMode.isPending}
              isRenaming={renameMode.isPending}
              isCloning={cloneMode.isPending}
              isRetiring={retireMode.isPending}
              isSettingPublished={saveMode.isPending}
              showDrafts={showDrafts}
              onToggleShowDrafts={setShowDrafts}
              canCreate={canCreate}
              canPublishSelected={canPublishSelected}
              canDeleteSelected={canDeleteSelected}
              canRenameSelected={canRenameSelected}
              canCloneSelected={canCloneSelected}
              canRetireSelected={canRetireSelected}
              renameDisabledReason={
                isDirty || isSaving
                  ? "Save your changes before renaming."
                  : null
              }
              cloneDisabledReason={
                isDirty || isSaving ? "Save your changes before cloning." : null
              }
              retireDisabledReason={
                isDirty || isSaving
                  ? "Save your changes before retiring."
                  : null
              }
            />
          </div>

          {hasSelection && (
            <div className="flex shrink-0 items-center gap-3">
              {/* #209 — group-only gate. Saves immediately on toggle
                  (like Publish); renders from lastSyncedRequiresGroup so
                  a failed save reverts visually. */}
              <div
                className="flex items-center gap-2"
                title="When on, this mode is only offered in group chats (Telegram groups) — hidden from WhatsApp, web, and DMs."
              >
                <Switch
                  id="mode-requires-group"
                  checked={lastSyncedRequiresGroup}
                  onCheckedChange={(checked) => {
                    handleSetRequiresGroup(checked).catch(() => {});
                  }}
                  disabled={!canEditSelected || isSaving}
                />
                <Label
                  htmlFor="mode-requires-group"
                  className="text-muted-foreground text-xs font-normal"
                >
                  Requires group chat
                </Label>
              </div>
              <span
                className="text-muted-foreground text-xs tabular-nums"
                aria-live="polite"
              >
                {saveStatus}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={!effectiveOrg}
                title="Download a Markdown snapshot of this mode's config"
              >
                <Download className="mr-1.5 size-3.5" />
                Export
              </Button>
              <Button
                size="sm"
                onClick={flushSave}
                disabled={!isDirty || isSaving || !canEditSelected}
                title={
                  canEditSelected
                    ? undefined
                    : "You don't have edit rights on this mode."
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
                &ldquo;{selectedMode}&rdquo;
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

      {/* #260 — post-rename display-name sync prompt (option 4 from the
          #232 verification thread). Opens after a successful rename when
          the mode's label no longer matches its slug. */}
      <AlertDialog
        open={labelSync !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLabelSync(null);
            setLabelSyncValue("");
            setLabelSyncError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update the display name too?</AlertDialogTitle>
            <AlertDialogDescription>
              The slug is now{" "}
              <span className="text-foreground font-mono font-medium">
                {labelSync?.name}
              </span>
              , but this mode still shows as{" "}
              <span className="text-foreground font-medium">
                &ldquo;{labelSync?.label}&rdquo;
              </span>{" "}
              in the mode list. Update the display name so the rename is visible
              there, or keep the current one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mode-label-sync" className="text-xs">
              Display name
            </Label>
            <Input
              id="mode-label-sync"
              value={labelSyncValue}
              onChange={(e) => setLabelSyncValue(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {labelSyncError && (
            <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
              {labelSyncError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMode.isPending}>
              Keep current name
            </AlertDialogCancel>
            {/* Plain Button — AlertDialogAction auto-closes before an
                error could render inline (#102); close happens in
                handleConfirmLabelSync on success. */}
            <Button
              onClick={handleConfirmLabelSync}
              disabled={saveMode.isPending || !labelSyncValue.trim()}
            >
              {saveMode.isPending ? "Updating…" : "Update name"}
            </Button>
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
