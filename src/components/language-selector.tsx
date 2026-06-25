import { useCallback, useState } from "react";
import { faLanguage } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Eye, EyeOff, Plus, Send, SendHorizontal, Trash2 } from "lucide-react";

import { runConfirmedAction } from "@/lib/run-confirmed-action";
import type { Language, OrgLanguages } from "@/types/language";
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

interface LanguageSelectorProps {
  languagesData: OrgLanguages | undefined;
  selectedLanguage: string | null;
  onSelectLanguage: (language: string | null) => void;
  onCreateLanguage: (name: string, label: string) => void;
  /** Must return a promise that rejects on error — the destructive
      confirmation dialogs render inline error UI on the rejection path
      and stay open so the user can read it (#102). */
  onDeleteLanguage: (name: string) => Promise<void>;
  onSetPublished: (name: string, published: boolean) => Promise<void>;
  isCreating: boolean;
  isDeleting: boolean;
  isSettingPublished: boolean;
  showDrafts: boolean;
  onToggleShowDrafts: (showDrafts: boolean) => void;
  // #181 verb-perms capabilities, replacing the old `isAdmin` flag.
  // Languages do NOT carry an admin trump (PR #185 enforced per-row
  // even for super-admins), so these are pure verb-perm reads computed
  // by the parent against the user's effective edit/publish rights:
  //
  //   canCreate         = user has some edit rights on this org
  //   canPublishSelected = hasRights(publishRights, selectedLanguage)
  //   canDeleteSelected  = canPublishSelected && canEditSelected
  //                       (worker DELETE rule)
  canCreate: boolean;
  canPublishSelected: boolean;
  canDeleteSelected: boolean;
  /** Scaffold template must finish loading before create can fire — new
      languages are pre-populated with the org's scaffold (#74), so creating
      before the scaffold arrives would silently save a blank document. */
  isScaffoldReady: boolean;
  scaffoldError: boolean;
}

function isPublished(lang: Pick<Language, "published">): boolean {
  return lang.published === true;
}

export function LanguageSelector({
  languagesData,
  selectedLanguage,
  onSelectLanguage,
  onCreateLanguage,
  onDeleteLanguage,
  onSetPublished,
  isCreating,
  isDeleting,
  isSettingPublished,
  showDrafts,
  onToggleShowDrafts,
  canCreate,
  canPublishSelected,
  canDeleteSelected,
  isScaffoldReady,
  scaffoldError,
}: LanguageSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Destructive-confirmation dialogs are controlled so we can keep them
  // open on async failure and render the error inline (#102). Closing on
  // success happens in the handlers below; the open-state setter is also
  // wired to clear the per-dialog error when the user dismisses.
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmUnpublish = useCallback(() => {
    if (selectedLanguage === null) return;
    return runConfirmedAction(
      () => onSetPublished(selectedLanguage, false),
      setUnpublishError,
      () => setUnpublishOpen(false),
      "Failed to unpublish language."
    );
  }, [onSetPublished, selectedLanguage]);

  const handleConfirmDelete = useCallback(() => {
    if (selectedLanguage === null) return;
    return runConfirmedAction(
      () => onDeleteLanguage(selectedLanguage),
      setDeleteError,
      () => setDeleteOpen(false),
      "Failed to delete language."
    );
  }, [onDeleteLanguage, selectedLanguage]);

  const languages = languagesData?.languages ?? [];
  const selectedData =
    languages.find((l) => l.name === selectedLanguage) ?? null;
  const selectedIsPublished = selectedData ? isPublished(selectedData) : false;

  const visibleLanguages = languages.filter(
    (l) => showDrafts || isPublished(l) || l.name === selectedLanguage
  );

  const handleCreate = useCallback(() => {
    const slug = newName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug) return;
    onCreateLanguage(slug, newLabel.trim());
    setNewName("");
    setNewLabel("");
    setShowCreate(false);
  }, [newName, newLabel, onCreateLanguage]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-initial">
          <div className="bg-primary/10 dark:bg-primary/20 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <FontAwesomeIcon icon={faLanguage} className="text-base" />
          </div>
          <Select
            value={selectedLanguage ?? ""}
            onValueChange={(value) =>
              onSelectLanguage(value === "" ? null : value)
            }
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {visibleLanguages.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-xs">
                  No languages yet
                </div>
              ) : (
                visibleLanguages.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{l.label || l.name}</span>
                      {!isPublished(l) && (
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
            New Language
          </Button>
        )}

        {selectedLanguage !== null && selectedData && (
          <div className="border-border flex items-center gap-2 sm:border-l sm:pl-3">
            <Badge
              variant={selectedIsPublished ? "default" : "outline"}
              className="shrink-0"
            >
              {selectedIsPublished ? "Published" : "Draft"}
            </Badge>

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
                      <AlertDialogTitle>Unpublish language?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This language will immediately stop shaping responses
                        for end users. Admins will still be able to see and edit
                        it as a draft.
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
                    // warning — the parent's mutation state (forbidden
                    // errors via saveLanguage.error → forbiddenError
                    // banner) handles user-visible surfacing of 403s; other
                    // failures remain silent, matching pre-#102 behavior
                    // when the parent used `mutate` instead of
                    // `mutateAsync`.
                    onSetPublished(selectedLanguage, true).catch(() => {});
                  }}
                >
                  <Send className="mr-1.5 size-3.5" />
                  Publish
                </Button>
              ))}

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
                    <AlertDialogTitle>Delete language</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedLanguage}&rdquo;
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
            Create a new language
          </p>
          <p className="text-muted-foreground mb-3 text-xs">
            New languages are created as drafts and don&rsquo;t shape responses
            until published.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lang-name" className="text-xs">
                Name (slug)
              </Label>
              <Input
                id="lang-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. arabic"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lang-label" className="text-xs">
                Display Label
              </Label>
              <Input
                id="lang-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Arabic"
                className="h-8 text-sm"
              />
            </div>
          </div>
          {!isScaffoldReady && (
            <p
              className={
                scaffoldError
                  ? "text-destructive mt-3 text-xs"
                  : "text-muted-foreground mt-3 text-xs"
              }
              role={scaffoldError ? "alert" : undefined}
              aria-live="polite"
            >
              {scaffoldError
                ? "Couldn't load the language template. Refresh the page to try again."
                : "Loading language template…"}
            </p>
          )}
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
              disabled={!newName.trim() || isCreating || !isScaffoldReady}
            >
              {isCreating ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
