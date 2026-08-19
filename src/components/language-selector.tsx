import { useCallback, useEffect, useMemo, useState } from "react";
import { faLanguage } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Eye,
  EyeOff,
  Plus,
  Send,
  SendHorizontal,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";

import {
  defaultLanguageName,
  describeLanguageDefault,
  isDefaultControlAvailable,
  type LanguageDefaultState,
} from "@/lib/language-default-state";
import { classifyLanguageCreate } from "@/lib/language-create";
import {
  describeLanguageDeleteError,
  shouldOfferDefaultRecovery,
} from "@/lib/language-error-surface";
import { runConfirmedAction } from "@/lib/run-confirmed-action";
import { cn } from "@/lib/utils";
import type { LanguageRights } from "@/types/auth";
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
  /** Returns a promise that rejects on error so the destructive
      create-over-existing confirmation can render its failure inline and stay
      open (grok F2 / #102). The plain create path ignores the result. */
  onCreateLanguage: (name: string, label: string) => void | Promise<void>;
  /** The caller's effective language EDIT rights, already trump-aware (`"*"`
      for admins and cross-org super-admins). #293: a create over an existing
      slug overwrites its document with a blank scaffold and unpublishes it, so
      the selector confirms first when the caller may overwrite the row, and
      refuses up front when they can't (the worker would 403 the write).
      `undefined` is the legacy full-access shape (see hasRights). */
  editRights: LanguageRights | undefined;
  /** The caller's effective language PUBLISH rights, same trump-aware shape as
      editRights. #293: re-scaffolding a PUBLISHED language unpublishes it, so
      the worker's overwrite PUT needs publish rights too — used to block an
      edit-only caller before a confirmation that would 403. */
  publishRights: LanguageRights | undefined;
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
  // Computed by the parent against the user's EFFECTIVE edit/publish
  // rights, which for anyone with admin powers — and for a super-admin
  // viewing another org — are "*": #249 gave admins a trump over per-row
  // language rights (the earlier PR #185 rule, per-row even for
  // super-admins, is gone). So these flags are already trump-aware and
  // this component never reasons about admin-ness itself:
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
  /** #286 — org default language, already reduced to a renderable state by
      the page (`computeLanguageDefaultState`), loading and failure states
      included. This component renders what the state says and never infers
      readiness itself: `pending` renders nothing, `unsupported` renders a
      quiet admin-only note, `error` renders a real error. */
  defaultState: LanguageDefaultState;
  /** Setting/clearing the org default is admin-only — it's one org-wide
      pointer, not a per-row right (mirror of the worker's PUT gate on
      /api/config/languages-default). */
  canSetDefault: boolean;
  /** Must reject on error — the set path renders the message inline and the
      clear path keeps its confirmation dialog open (#102 pattern). */
  onSetDefault: (name: string | null) => Promise<void>;
  isSettingDefault: boolean;
}

function isPublished(lang: Pick<Language, "published">): boolean {
  return lang.published === true;
}

export function LanguageSelector({
  languagesData,
  selectedLanguage,
  onSelectLanguage,
  onCreateLanguage,
  editRights,
  publishRights,
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
  defaultState,
  canSetDefault,
  onSetDefault,
  isSettingDefault,
}: LanguageSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  // #293: create-time collision handling. `createError` blocks a create over a
  // name the caller can't edit; `overwriteTarget` drives the destructive
  // confirmation for a create over one they can (replace document + unpublish).
  const [createError, setCreateError] = useState<string | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<{
    slug: string;
    label: string;
  } | null>(null);
  const [overwriteError, setOverwriteError] = useState<string | null>(null);

  // Destructive-confirmation dialogs are controlled so we can keep them
  // open on async failure and render the error inline (#102). Closing on
  // success happens in the handlers below; the open-state setter is also
  // wired to clear the per-dialog error when the user dismisses.
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The delete failure is kept as the thrown VALUE, not as a message
  // string: the dialog needs its class to decide both the wording (role-
  // aware) and whether to offer the inline recovery action (#286 review
  // rd-2 P2-1). `recoveryError` is the recovery attempt's own failure.
  const [deleteFailure, setDeleteFailure] = useState<unknown>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  // The set path has no dialog to render into, so its failure lands in the
  // notice row beneath the toolbar.
  const [setDefaultError, setSetDefaultError] = useState<string | null>(null);

  const handleConfirmUnpublish = useCallback(() => {
    if (selectedLanguage === null) return;
    return runConfirmedAction(
      () => onSetPublished(selectedLanguage, false),
      setUnpublishError,
      () => setUnpublishOpen(false),
      "Failed to unpublish language."
    );
  }, [onSetPublished, selectedLanguage]);

  // Not `runConfirmedAction` (unlike its siblings): this dialog needs the
  // error CLASS, not just its message — the 409 both selects role-aware
  // copy and unlocks the inline recovery action below. Same contract
  // otherwise: stay open on failure, close only on success (#102).
  const handleConfirmDelete = useCallback(async () => {
    if (selectedLanguage === null) return;
    setDeleteFailure(null);
    setRecoveryError(null);
    try {
      await onDeleteLanguage(selectedLanguage);
      setDeleteOpen(false);
    } catch (err: unknown) {
      setDeleteFailure(err);
    }
  }, [onDeleteLanguage, selectedLanguage]);

  // Inline recovery from the 409, offered inside the delete dialog itself.
  // Deliberately independent of `defaultState`: when the languages-default
  // GET is failing, the state machine withholds the toolbar Set/Clear
  // controls, yet the server still HAS a default and still 409s the
  // delete — which left the admin reading an instruction pointing at
  // controls that weren't on screen (#286 review rd-2 P2-1). Clearing is
  // a write; it doesn't need a successful read to be legal.
  const handleRecoverClearDefault = useCallback(() => {
    setRecoveryError(null);
    onSetDefault(null)
      .then(() => {
        // The block is gone — drop the stale 409 and its recovery
        // affordance so the dialog shows a plain, retryable Delete
        // (#286 review rd-2 P3: the dialog-local error outliving the
        // recovery is reachable now that the recovery happens INSIDE the
        // open dialog).
        setDeleteFailure(null);
        setRecoveryError(null);
      })
      .catch((err: unknown) => {
        setRecoveryError(
          err instanceof Error
            ? err.message
            : "Failed to clear the default language."
        );
      });
  }, [onSetDefault]);

  const handleSetDefault = useCallback(() => {
    if (selectedLanguage === null) return;
    setSetDefaultError(null);
    onSetDefault(selectedLanguage).catch((err: unknown) => {
      setSetDefaultError(
        err instanceof Error
          ? err.message
          : "Failed to set the default language."
      );
    });
  }, [onSetDefault, selectedLanguage]);

  // A set-default failure describes an attempt on one row; switching rows
  // makes it stale. (The set path has no dialog whose dismissal would
  // otherwise clear it.)
  useEffect(() => {
    setSetDefaultError(null);
  }, [selectedLanguage]);

  // Memoized: the `?? []` fallback would otherwise mint a fresh array
  // identity every render, and this page re-renders on every keystroke
  // (the editor draft lives in the parent's state).
  const languages = useMemo(
    () => languagesData?.languages ?? [],
    [languagesData]
  );
  const selectedData =
    languages.find((l) => l.name === selectedLanguage) ?? null;
  const selectedIsPublished = selectedData ? isPublished(selectedData) : false;

  const visibleLanguages = languages.filter(
    (l) => showDrafts || isPublished(l) || l.name === selectedLanguage
  );

  // #286 org default. `defaultName` drives the per-row badge; the notice
  // carries the three end-user-facing states (healthy / draft-warning /
  // none) plus the drift and read-failure cases. Every "should this render
  // at all?" decision comes from the state machine, so an unresolved read
  // renders nothing at all rather than a claim about the org.
  const defaultName = defaultLanguageName(defaultState);
  const defaultNotice = describeLanguageDefault(defaultState, canSetDefault);
  const defaultControlAvailable = isDefaultControlAvailable(defaultState);
  const selectedIsDefault =
    selectedLanguage !== null && selectedLanguage === defaultName;
  // #286 — deleting the org default is a guaranteed upstream 409. For a
  // viewer who can fix that (admins), block the click and say why; for a
  // shepherd who holds delete rights but cannot touch the org default,
  // leave the button live — disabling it would offer no recovery at all,
  // and the 409 they get carries the "ask an admin" copy.
  const deleteBlockedByDefault = selectedIsDefault && canSetDefault;
  // Recovery is offered from the ERROR, never from `defaultState`: the
  // state machine withholds the toolbar controls while the
  // languages-default GET is failing, but the server still has a default
  // and still 409s the delete.
  const deleteErrorMessage =
    recoveryError ??
    (deleteFailure === null
      ? null
      : describeLanguageDeleteError(deleteFailure, canSetDefault));
  const offerDefaultRecovery = shouldOfferDefaultRecovery(
    deleteFailure,
    canSetDefault
  );

  const handleCreate = useCallback(() => {
    const slug = newName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug) return;
    setCreateError(null);
    // #293 race: until the catalog loads, `languages` is [], so a collision
    // would classify as `create` and silently overwrite — the exact bug this
    // guards against. Refuse to classify against a list we don't have yet.
    if (languagesData === undefined) {
      setCreateError(
        "Still loading the language list — try again in a moment."
      );
      return;
    }
    // #293: a create over an existing slug PUTs a blank scaffold that
    // overwrites the language's tuning document and unpublishes it. #272
    // removed the last guard, so it happened silently. #249 lists the org's
    // whole catalog, so `languages` is authoritative for what names are taken;
    // edit/publish rights + the target's published state decide whether this
    // caller may overwrite (confirm first) or the worker would 403 (block).
    const existingRow = languages.find((l) => l.name === slug);
    // The collection can lag a just-created slug (its save seeds the detail
    // cache and upserts the list, but a second create can still race a pending
    // refetch). If the slug is the row currently open, it definitionally
    // exists, so route it through confirm rather than a silent re-create even
    // when the list hasn't caught up (grok rd-5). A freshly created row is a
    // draft; the worker still gates the write.
    const existing = existingRow
      ? { published: isPublished(existingRow) }
      : selectedLanguage === slug
        ? { published: false }
        : null;
    const action = classifyLanguageCreate(
      slug,
      existing,
      editRights,
      publishRights
    );
    if (action.kind === "blocked") {
      setCreateError(
        action.reason === "publish"
          ? `“${slug}” is a published language and you don’t have publish rights on it, so it can’t be replaced here — replacing it would unpublish it. Ask an admin.`
          : `A language named “${slug}” already exists in this org, but you don’t have edit rights on it. Pick a different name, or ask a shepherd or admin for access.`
      );
      return;
    }
    if (action.kind === "confirm") {
      setOverwriteTarget({ slug, label: newLabel.trim() });
      return;
    }
    // Plain create is fire-and-forget; its errors surface via the page's save
    // state, not inline here. Swallow the rejection so it isn't unhandled.
    void Promise.resolve(onCreateLanguage(slug, newLabel.trim())).catch(
      () => {}
    );
    setNewName("");
    setNewLabel("");
    setShowCreate(false);
  }, [
    newName,
    newLabel,
    onCreateLanguage,
    languages,
    languagesData,
    selectedLanguage,
    editRights,
    publishRights,
  ]);

  // Re-scaffolding an existing language is destructive (blank document +
  // unpublish), so it only runs from the confirmation dialog. Unlike the plain
  // create path it awaits the write and keeps the dialog open on failure,
  // rendering the error inline (grok F2 / #102) — the same contract as the
  // Unpublish/Delete dialogs.
  const handleConfirmOverwrite = useCallback(() => {
    if (overwriteTarget === null) return;
    const { slug, label } = overwriteTarget;
    return runConfirmedAction(
      () => Promise.resolve(onCreateLanguage(slug, label)),
      setOverwriteError,
      () => {
        setOverwriteTarget(null);
        setNewName("");
        setNewLabel("");
        setShowCreate(false);
        setCreateError(null);
      },
      "Failed to replace language."
    );
  }, [overwriteTarget, onCreateLanguage]);

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
                      {l.name === defaultName && (
                        <Badge
                          variant="secondary"
                          className="gap-1 px-1.5 py-0 text-[10px]"
                        >
                          <Star className="size-2.5 fill-current" />
                          Default
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

        {/* #286 — drift recovery. The dangling slug isn't in the dropdown,
            so the per-row control below can never reach it; this is the
            only Clear an admin can press to fix the state the notice is
            warning about. Rendered outside the selection cluster because
            it is deliberately independent of what's selected. */}
        {canSetDefault && defaultState.kind === "missing" && (
          <ClearDefaultControl
            onSetDefault={onSetDefault}
            isSettingDefault={isSettingDefault}
            drift
          />
        )}

        {selectedLanguage !== null && selectedData && (
          <div className="border-border flex items-center gap-2 sm:border-l sm:pl-3">
            <Badge
              variant={selectedIsPublished ? "default" : "outline"}
              className="shrink-0"
            >
              {selectedIsPublished ? "Published" : "Draft"}
            </Badge>

            {/* #286 — set/clear the org default for the selected language.
                Admin-only (the worker's PUT gate is admin-only too), and
                absent entirely on a worker without the route pair. */}
            {canSetDefault &&
              defaultControlAvailable &&
              (selectedIsDefault ? (
                <ClearDefaultControl
                  onSetDefault={onSetDefault}
                  isSettingDefault={isSettingDefault}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSettingDefault}
                  onClick={handleSetDefault}
                  title={
                    defaultName === null
                      ? "Make this the language end users get without asking"
                      : `Replace "${defaultName}" as the org default`
                  }
                >
                  <Star className="mr-1.5 size-3.5" />
                  Set as default
                </Button>
              ))}

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
                  if (!next) {
                    setDeleteFailure(null);
                    setRecoveryError(null);
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting || deleteBlockedByDefault}
                    title={
                      deleteBlockedByDefault
                        ? "Clear or change the org default first"
                        : undefined
                    }
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
                  {deleteErrorMessage && (
                    <div className="bg-destructive/10 border-destructive space-y-2 border-l-2 px-3 py-2">
                      <p className="text-destructive text-sm">
                        {deleteErrorMessage}
                      </p>
                      {/* The recovery the copy prescribes, right where the
                          user reads it — and reachable even when the
                          org-default READ is failing, which is exactly
                          when the toolbar control is withheld. Shepherds
                          don't get it: their copy says "ask an admin"
                          because the worker's PUT is admin-only. */}
                      {offerDefaultRecovery && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRecoverClearDefault}
                          disabled={isSettingDefault}
                        >
                          <StarOff className="mr-1.5 size-3.5" />
                          {isSettingDefault
                            ? "Clearing…"
                            : "Clear the org default"}
                        </Button>
                      )}
                    </div>
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

      {/* #286 — one line that says what end users actually get. Rendered
          for every viewer (shepherds included: whether their draft is the
          org default changes what "publish" means for them), while the
          set/clear control above stays admin-only.

          Three renders are deliberately distinct, because they were one
          line in the first draft and that conflated a slow network with a
          missing feature:
            pending     → nothing (no text, no layout shift)
            unsupported → the quiet admin-only note below
            error       → a real error notice, never "not available" */}
      {defaultState.kind === "unsupported"
        ? canSetDefault && (
            <p className="text-muted-foreground text-xs" aria-live="polite">
              Setting an org default language isn&rsquo;t available on this
              org&rsquo;s worker yet.
            </p>
          )
        : defaultNotice && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                defaultNotice.tone === "warning" &&
                  "rounded-r-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400",
                defaultNotice.tone === "error" &&
                  "bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2",
                (defaultNotice.tone === "healthy" ||
                  defaultNotice.tone === "info") &&
                  "text-muted-foreground"
              )}
              role={defaultNotice.tone === "error" ? "alert" : undefined}
              aria-live="polite"
            >
              {defaultNotice.tone === "healthy" && (
                <Star className="size-3 shrink-0 fill-current" />
              )}
              {defaultNotice.message}
            </p>
          )}

      {setDefaultError && (
        <p className="text-destructive text-xs" role="alert">
          {setDefaultError}
        </p>
      )}

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
          {createError && (
            <p className="text-destructive mt-3 text-xs" role="alert">
              {createError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreate(false);
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={
                !newName.trim() ||
                isCreating ||
                !isScaffoldReady ||
                languagesData === undefined
              }
            >
              {isCreating ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </div>
      )}

      {/* #293 — a create over an existing language re-scaffolds it (blank
          document + unpublish). Confirm before that destructive write instead
          of doing it silently. Plain Button, not AlertDialogAction, to match
          the file's other destructive dialogs (#102). */}
      <AlertDialog
        open={overwriteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setOverwriteTarget(null);
            setOverwriteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace “{overwriteTarget?.slug}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A language named “{overwriteTarget?.slug}” already exists.
              Creating it again replaces its tuning document with a blank
              scaffold and unpublishes it. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {overwriteError && (
            <p className="text-destructive text-sm" role="alert">
              {overwriteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleConfirmOverwrite}
              disabled={isCreating}
            >
              Replace and unpublish
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ClearDefaultControlProps {
  /** Must reject on error — the dialog stays open and renders it inline. */
  onSetDefault: (name: string | null) => Promise<void>;
  isSettingDefault: boolean;
  /** The org default points at a slug that isn't in the org's list. That
      row can't be selected (it isn't in the dropdown), so this instance is
      the ONLY way to reach Clear — without it the drift notice prescribes
      a recovery the UI can't perform (#286 review P3-5). */
  drift?: boolean;
}

// Extracted so the selected-row control and the drift-recovery control are
// the same affordance with the same confirmation semantics, rather than
// two dialogs that could drift apart. Owns its open/error state: each
// instance is independently dismissable, and #102's rule (plain Button,
// close only on success) holds for both.
function ClearDefaultControl({
  onSetDefault,
  isSettingDefault,
  drift = false,
}: ClearDefaultControlProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(
    () =>
      runConfirmedAction(
        () => onSetDefault(null),
        setError,
        () => setOpen(false),
        "Failed to clear the default language."
      ),
    [onSetDefault]
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isSettingDefault}
          className={cn(
            drift && "text-amber-700 hover:text-amber-700 dark:text-amber-400"
          )}
        >
          <StarOff className="mr-1.5 size-3.5" />
          Clear default
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the org default language?</AlertDialogTitle>
          <AlertDialogDescription>
            {drift ? (
              <>
                The org default points at a language that isn&rsquo;t in this
                org&rsquo;s list, so nothing resolves it. Clearing removes the
                dangling pointer — end users keep getting tuning only when they
                ask for a language with{" "}
                <span className="text-foreground font-medium">@language</span>.
              </>
            ) : (
              <>
                End users will stop receiving this language&rsquo;s tuning
                automatically — after this, tuning only applies when they ask
                for a language with{" "}
                <span className="text-foreground font-medium">@language</span>.
                The language itself is not changed.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSettingDefault}>
            Cancel
          </AlertDialogCancel>
          {/* Plain Button — AlertDialogAction auto-closes before onError
              can render the inline message (#102). */}
          <Button onClick={handleConfirm} disabled={isSettingDefault}>
            {isSettingDefault ? "Clearing…" : "Clear default"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
