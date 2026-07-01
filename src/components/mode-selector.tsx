import { useCallback, useState } from "react";
import { faLayerGroup } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ArrowRightLeft,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Send,
  SendHorizontal,
  Trash2,
} from "lucide-react";

import { pickCloneDefaultSlug } from "@/lib/mode-clone-defaults";
import { runConfirmedAction } from "@/lib/run-confirmed-action";
import type { OrgModes, PromptMode } from "@/types/prompt-override";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ModeSelectorProps {
  modesData: OrgModes | undefined;
  selectedMode: string | null;
  onSelectMode: (mode: string | null) => void;
  onCreateMode: (name: string, label: string, description: string) => void;
  /** Must return a promise that rejects on error — the destructive
      confirmation dialogs render inline error UI on the rejection path
      and stay open so the user can read it (#102). */
  onDeleteMode: (name: string) => Promise<void>;
  onSetPublished: (name: string, published: boolean) => Promise<void>;
  /** Reslug a mode in place (#232). Like onDeleteMode, must reject on
      error so the rename dialog can surface it inline and stay open. */
  onRenameMode: (name: string, newName: string) => Promise<void>;
  /** Clone a mode via the engine's `_clone` op (#241 PR B). Must reject
      on error so the clone dialog can surface it inline and stay open. */
  onCloneMode: (
    name: string,
    newName: string,
    newLabel: string
  ) => Promise<void>;
  /** Retire a mode and forward its users to `forwardTo` via the engine's
      `_retire` op (#241 PR C). Same reject-on-error contract as delete
      and clone. */
  onRetireMode: (name: string, forwardTo: string) => Promise<void>;
  isCreating: boolean;
  isDeleting: boolean;
  isRenaming: boolean;
  isCloning: boolean;
  isRetiring: boolean;
  isSettingPublished: boolean;
  showDrafts: boolean;
  onToggleShowDrafts: (showDrafts: boolean) => void;
  // #181 verb-perms — modes DO carry an admin trump (worker bypasses
  // the per-mode gate for admins), so the parent should compute these
  // as `isAdmin || verb-rights-on-row`. Replaces the prior `isAdmin`
  // flag which made non-admin mode shepherds unable to publish/delete
  // even when the worker would have allowed them.
  canCreate: boolean;
  canPublishSelected: boolean;
  canDeleteSelected: boolean;
  canRenameSelected: boolean;
  /** Clone rides the same admin/cross-org gate as rename today: fresh
      mode has no per-user rights assigned, so a non-admin cloning would
      end up with a mode they can't edit. Kept as a separate flag so the
      restriction can loosen independently once rights-migration lands. */
  canCloneSelected: boolean;
  /** Retire rides the same admin/cross-org gate — deleting a mode +
      widening the target's alias set is an org-wide config change
      identical in trust bar to rename. Kept as its own flag so the
      restriction can loosen independently. */
  canRetireSelected: boolean;
  /** Non-null disables the Rename trigger and shows the string as its
      tooltip — used to block rename while the editor has unsaved edits
      (renaming re-syncs the doc under the new slug and would drop them). */
  renameDisabledReason: string | null;
  /** Non-null disables the Clone trigger and shows the string as its
      tooltip. Same shape as `renameDisabledReason` and used for the
      same reason: cloning switches selection to the fresh clone, which
      silently re-syncs the editor from the clone's document and drops
      any unsaved edits to the source (#241 PR B Frank F1). */
  cloneDisabledReason: string | null;
  /** Non-null disables the Retire trigger and shows the string as its
      tooltip. Same shape as `renameDisabledReason` / `cloneDisabledReason`
      — retire deletes the source and shifts selection to the target,
      which would silently drop any unsaved edits. Belt-and-suspenders
      route through `handleSelectMode` in modes.tsx defends the race
      window when focus escapes the modal. */
  retireDisabledReason: string | null;
}

function isPublished(mode: Pick<PromptMode, "published">): boolean {
  return mode.published === true;
}

// Canonical mode-slug normalization, shared by the create and rename
// flows: lowercase, spaces → hyphens, drop anything outside
// [a-z0-9-_], trim leading/trailing hyphens. The engine validates the
// result again server-side.
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/^-+|-+$/g, "");
}

export function ModeSelector({
  modesData,
  selectedMode,
  onSelectMode,
  onCreateMode,
  onDeleteMode,
  onSetPublished,
  onRenameMode,
  onCloneMode,
  onRetireMode,
  isCreating,
  isDeleting,
  isRenaming,
  isCloning,
  isRetiring,
  isSettingPublished,
  showDrafts,
  onToggleShowDrafts,
  canCreate,
  canPublishSelected,
  canDeleteSelected,
  canRenameSelected,
  canCloneSelected,
  canRetireSelected,
  renameDisabledReason,
  cloneDisabledReason,
  retireDisabledReason,
}: ModeSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Destructive-confirmation dialogs are controlled so we can keep them
  // open on async failure and render the error inline (#102). Closing on
  // success happens in the handlers below; the open-state setter is also
  // wired to clear the per-dialog error when the user dismisses.
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneLabel, setCloneLabel] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireError, setRetireError] = useState<string | null>(null);
  const [retireTarget, setRetireTarget] = useState<string>("");

  const handleConfirmUnpublish = useCallback(() => {
    if (selectedMode === null) return;
    return runConfirmedAction(
      () => onSetPublished(selectedMode, false),
      setUnpublishError,
      () => setUnpublishOpen(false),
      "Failed to unpublish mode."
    );
  }, [onSetPublished, selectedMode]);

  const handleConfirmDelete = useCallback(() => {
    if (selectedMode === null) return;
    return runConfirmedAction(
      () => onDeleteMode(selectedMode),
      setDeleteError,
      () => setDeleteOpen(false),
      "Failed to delete mode."
    );
  }, [onDeleteMode, selectedMode]);

  const handleConfirmRetire = useCallback(() => {
    if (selectedMode === null) return;
    if (!retireTarget) {
      setRetireError("Pick a mode to forward users to.");
      return;
    }
    if (retireTarget === selectedMode) {
      // Belt-and-suspenders — the Select excludes self, but the engine
      // also 400s a retire-to-self and this catches any wire-shape
      // slip. Keeps the affordance ↔ action gate consistent.
      setRetireError("Forward target must differ from the source.");
      return;
    }
    return runConfirmedAction(
      () => onRetireMode(selectedMode, retireTarget),
      setRetireError,
      () => {
        setRetireOpen(false);
        setRetireTarget("");
      },
      "Failed to retire mode."
    );
  }, [onRetireMode, retireTarget, selectedMode]);

  const handleConfirmClone = useCallback(() => {
    if (selectedMode === null) return;
    const slug = slugify(cloneName);
    if (!slug) {
      setCloneError("Enter a valid name (letters, numbers, hyphens).");
      return;
    }
    if (slug === selectedMode) {
      setCloneError(
        "New name must differ from the source. (Rename instead if you want to reslug in place.)"
      );
      return;
    }
    return runConfirmedAction(
      () => onCloneMode(selectedMode, slug, cloneLabel.trim()),
      setCloneError,
      () => {
        setCloneOpen(false);
        setCloneName("");
        setCloneLabel("");
      },
      "Failed to clone mode."
    );
  }, [cloneLabel, cloneName, onCloneMode, selectedMode]);

  const handleConfirmRename = useCallback(() => {
    if (selectedMode === null) return;
    const slug = slugify(renameValue);
    if (!slug) {
      setRenameError("Enter a valid name (letters, numbers, hyphens).");
      return;
    }
    if (slug === selectedMode) {
      setRenameError("New name must differ from the current name.");
      return;
    }
    return runConfirmedAction(
      () => onRenameMode(selectedMode, slug),
      setRenameError,
      () => {
        setRenameOpen(false);
        setRenameValue("");
      },
      "Failed to rename mode."
    );
  }, [onRenameMode, renameValue, selectedMode]);

  const modes = modesData?.modes ?? [];
  const selectedModeData = modes.find((m) => m.name === selectedMode) ?? null;
  const selectedIsPublished = selectedModeData
    ? isPublished(selectedModeData)
    : false;

  // If drafts are hidden, still show the currently-selected draft so we don't
  // orphan the user's selection.
  const visibleModes = modes.filter(
    (m) => showDrafts || isPublished(m) || m.name === selectedMode
  );

  const handleCreate = useCallback(() => {
    const slug = slugify(newName);
    if (!slug) return;
    onCreateMode(slug, newLabel.trim(), newDescription.trim());
    setNewName("");
    setNewLabel("");
    setNewDescription("");
    setShowCreate(false);
  }, [newName, newLabel, newDescription, onCreateMode]);

  const handleSelectChange = useCallback(
    (value: string) => {
      onSelectMode(value === "" ? null : value);
    },
    [onSelectMode]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-initial">
          <div className="bg-primary/10 dark:bg-primary/20 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <FontAwesomeIcon icon={faLayerGroup} className="text-sm" />
          </div>
          <Select value={selectedMode ?? ""} onValueChange={handleSelectChange}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Select a mode" />
            </SelectTrigger>
            <SelectContent>
              {visibleModes.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-xs">
                  No modes yet
                </div>
              ) : (
                visibleModes.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{m.label || m.name}</span>
                      {!isPublished(m) && (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          Draft
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleShowDrafts(!showDrafts)}
          title={showDrafts ? "Hide drafts from the list" : "Show drafts"}
        >
          {showDrafts ? (
            <Eye className="mr-1.5 size-3.5" />
          ) : (
            <EyeOff className="mr-1.5 size-3.5" />
          )}
          {showDrafts ? "Drafts shown" : "Drafts hidden"}
        </Button>

        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1.5 size-3.5" />
            New Mode
          </Button>
        )}

        {selectedMode !== null && selectedModeData && (
          <div className="border-border flex flex-wrap items-center gap-2 sm:border-l sm:pl-3">
            <Badge
              variant={selectedIsPublished ? "default" : "outline"}
              className="shrink-0"
            >
              {selectedIsPublished ? "Published" : "Draft"}
            </Badge>

            {/* Alias badges (#232 / #241). A mode answers to its previous
                slug(s) after rename, or to its merged-in slug(s) after a
                retire-and-forward. Showing them is essential for trust —
                otherwise the rerouting is invisible. Engine omits the
                field when empty, so `aliases?.length` covers both cases. */}
            {selectedModeData.aliases?.length ? (
              <div
                className="flex flex-wrap items-center gap-1"
                role="list"
                aria-label={`Also resolves to ${selectedModeData.aliases.length} previous ${selectedModeData.aliases.length === 1 ? "slug" : "slugs"}`}
              >
                <span className="text-muted-foreground text-xs">also:</span>
                {selectedModeData.aliases.map((alias) => (
                  <Badge
                    key={alias}
                    variant="outline"
                    role="listitem"
                    title={`Users referencing "${alias}" still resolve to this mode (alias from rename or retire-and-forward).`}
                    className="text-muted-foreground font-mono text-[10px] font-normal"
                  >
                    {alias}
                  </Badge>
                ))}
              </div>
            ) : null}

            {canPublishSelected &&
              (selectedIsPublished ? (
                <AlertDialog
                  open={unpublishOpen}
                  onOpenChange={(next) => {
                    setUnpublishOpen(next);
                    if (!next) setUnpublishError(null);
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSettingPublished}
                    >
                      <SendHorizontal className="mr-1.5 size-3.5" />
                      Unpublish
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unpublish mode?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This mode will immediately disappear for all end users.
                        Admins will still be able to see and edit it as a draft.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {unpublishError && (
                      <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                        {unpublishError}
                      </p>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isSettingPublished}>
                        Cancel
                      </AlertDialogCancel>
                      {/* Plain Button — AlertDialogAction auto-closes the
                          dialog before onError can render the inline message
                          (#102). Close happens manually in
                          handleConfirmUnpublish on success. */}
                      <Button
                        onClick={handleConfirmUnpublish}
                        disabled={isSettingPublished}
                      >
                        {isSettingPublished ? "Unpublishing…" : "Unpublish"}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSettingPublished}
                  onClick={() => {
                    // No confirmation dialog on the publish path, so no
                    // inline UI to render an error into. Catch the
                    // rejection here purely to avoid an unhandled-rejection
                    // warning — failures remain silent, matching pre-#102
                    // behavior when the parent used `mutate` instead of
                    // `mutateAsync`.
                    onSetPublished(selectedMode, true).catch(() => {});
                  }}
                >
                  <Send className="mr-1.5 size-3.5" />
                  Publish
                </Button>
              ))}

            {canRenameSelected && (
              <AlertDialog
                open={renameOpen}
                onOpenChange={(next) => {
                  setRenameOpen(next);
                  if (next) {
                    // Prefill with the current slug so the user edits
                    // from it rather than retyping; clear stale errors.
                    setRenameValue(selectedMode);
                    setRenameError(null);
                  } else {
                    setRenameError(null);
                    setRenameValue("");
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRenaming || renameDisabledReason !== null}
                    title={renameDisabledReason ?? undefined}
                  >
                    <Pencil className="mr-1.5 size-3.5" />
                    Rename
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rename mode</AlertDialogTitle>
                    <AlertDialogDescription>
                      Change the slug for{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedMode}&rdquo;
                      </span>
                      . Existing users stay assigned &mdash; the old name keeps
                      working as an alias, so no one is left without a mode.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-1.5">
                    <Label htmlFor="mode-rename" className="text-xs">
                      New name (slug)
                    </Label>
                    <Input
                      id="mode-rename"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder="e.g. conversation"
                      className="h-8 text-sm"
                    />
                  </div>
                  {renameError && (
                    <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                      {renameError}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isRenaming}>
                      Cancel
                    </AlertDialogCancel>
                    {/* Plain Button — see comment in Unpublish dialog above. */}
                    <Button
                      onClick={handleConfirmRename}
                      disabled={isRenaming || !renameValue.trim()}
                    >
                      {isRenaming ? "Renaming…" : "Rename"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canCloneSelected && (
              <AlertDialog
                open={cloneOpen}
                onOpenChange={(next) => {
                  setCloneOpen(next);
                  if (next) {
                    // Prefill the slug with a dedup'd default so the
                    // first click doesn't guarantee a 409 on the second
                    // clone (#241 PR B Frank F5). Leave the label
                    // BLANK: prefilling with the source's label made
                    // "user cleared" and "user left prefilled" both
                    // send the same wire value, hiding the intent
                    // difference; the engine's inherit-vs-set-empty
                    // behavior for an omitted vs empty `newLabel` is
                    // unspecified in Ian's plan (#241 PR B Frank F7).
                    setCloneName(
                      selectedMode !== null
                        ? pickCloneDefaultSlug(
                            selectedMode,
                            modes.map((m) => m.name)
                          )
                        : ""
                    );
                    setCloneLabel("");
                    setCloneError(null);
                  } else {
                    setCloneError(null);
                    setCloneName("");
                    setCloneLabel("");
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isCloning || cloneDisabledReason !== null}
                    title={cloneDisabledReason ?? undefined}
                  >
                    <Copy className="mr-1.5 size-3.5" />
                    Clone
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clone mode</AlertDialogTitle>
                    <AlertDialogDescription>
                      Create a copy of{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedMode}&rdquo;
                      </span>{" "}
                      under a new slug. The clone starts as a draft &mdash; the
                      source mode is untouched and no users are moved.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="mode-clone-name" className="text-xs">
                        New name (slug)
                      </Label>
                      <Input
                        id="mode-clone-name"
                        value={cloneName}
                        onChange={(e) => setCloneName(e.target.value)}
                        placeholder="e.g. conversation-v2"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mode-clone-label" className="text-xs">
                        Display name (optional)
                      </Label>
                      <Input
                        id="mode-clone-label"
                        value={cloneLabel}
                        onChange={(e) => setCloneLabel(e.target.value)}
                        placeholder="Leave blank to skip"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {cloneError && (
                    <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                      {cloneError}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isCloning}>
                      Cancel
                    </AlertDialogCancel>
                    {/* Plain Button — see comment in Unpublish dialog above.
                        Gate matches handleConfirmClone's slug validation
                        so the affordance can't say "clickable" while the
                        confirm action always inline-fails (#241 PR B
                        Frank F4). */}
                    <Button
                      onClick={handleConfirmClone}
                      disabled={isCloning || !slugify(cloneName)}
                    >
                      {isCloning ? "Cloning…" : "Clone"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canRetireSelected && (
              <AlertDialog
                open={retireOpen}
                onOpenChange={(next) => {
                  setRetireOpen(next);
                  if (next) {
                    setRetireTarget("");
                    setRetireError(null);
                  } else {
                    setRetireError(null);
                    setRetireTarget("");
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRetiring || retireDisabledReason !== null}
                    title={retireDisabledReason ?? undefined}
                    className="text-amber-600 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-500"
                  >
                    <ArrowRightLeft className="mr-1.5 size-3.5" />
                    Retire
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Retire and forward</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedMode}&rdquo;
                      </span>{" "}
                      and forward every user assigned to it (plus anyone still
                      resolving via one of its previous aliases) onto the target
                      mode below. The target inherits the source&rsquo;s slug as
                      a new alias, so nobody is left without a mode &mdash; but
                      the source itself is permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-1.5">
                    <Label htmlFor="mode-retire-target" className="text-xs">
                      Forward to
                    </Label>
                    <Select
                      value={retireTarget}
                      onValueChange={setRetireTarget}
                    >
                      <SelectTrigger id="mode-retire-target" className="h-8">
                        <SelectValue placeholder="Pick a target mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {modes
                          .filter((m) => m.name !== selectedMode)
                          .map((m) => (
                            <SelectItem key={m.name} value={m.name}>
                              <span className="flex items-center gap-2">
                                <span className="truncate">
                                  {m.label || m.name}
                                </span>
                                {!isPublished(m) && (
                                  <Badge
                                    variant="outline"
                                    className="px-1.5 py-0 text-[10px]"
                                  >
                                    Draft
                                  </Badge>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {modes.filter((m) => m.name !== selectedMode).length ===
                      0 && (
                      <p className="text-muted-foreground text-xs">
                        No other modes exist to forward to. Create one first.
                      </p>
                    )}
                  </div>
                  {retireError && (
                    <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                      {retireError}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isRetiring}>
                      Cancel
                    </AlertDialogCancel>
                    {/* Plain Button — see comment in Unpublish dialog above.
                        Retire is destructive-styled to signal the source
                        goes away, but amber-not-red because users
                        aren't stranded (the alias route keeps them
                        resolving on the target). */}
                    <Button
                      variant="destructive"
                      onClick={handleConfirmRetire}
                      disabled={isRetiring || !retireTarget}
                    >
                      {isRetiring ? "Retiring…" : "Retire & forward"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {canDeleteSelected && (
              <AlertDialog
                open={deleteOpen}
                onOpenChange={(next) => {
                  setDeleteOpen(next);
                  if (!next) setDeleteError(null);
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete mode</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedMode}&rdquo;
                      </span>
                      ? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteError && (
                    <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                      {deleteError}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      Cancel
                    </AlertDialogCancel>
                    {/* Plain Button — see comment in Unpublish dialog above. */}
                    <Button
                      variant="destructive"
                      onClick={handleConfirmDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="bg-card animate-in fade-in slide-in-from-bottom-4 rounded-xl border p-4 shadow-sm duration-200">
          <p className="text-foreground mb-3 text-sm font-medium">
            Create a new mode
          </p>
          <p className="text-muted-foreground mb-3 text-xs">
            New modes are created as drafts and are not visible to end users
            until published.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mode-name" className="text-xs">
                Name (slug)
              </Label>
              <Input
                id="mode-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. kids-mode"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mode-label" className="text-xs">
                Display Label
              </Label>
              <Input
                id="mode-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Kids Mode"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mode-desc" className="text-xs">
              Description
            </Label>
            <Textarea
              id="mode-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional description for this mode..."
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
