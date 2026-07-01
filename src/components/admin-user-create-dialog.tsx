import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import type { LanguageRights } from "@/types/auth";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
  isReservedOrgSlug,
} from "@/lib/admin-users-api";
import { useAuthStore } from "@/lib/auth-store";
import { canBootstrapLanguage } from "@/lib/language-bootstrap-gate";
import { useCreateAdminUser } from "@/hooks/use-admin-users";
import { useLanguages, useSaveLanguage } from "@/hooks/use-languages";
import { useLanguageScaffold } from "@/hooks/use-language-scaffold";
import { useModes } from "@/hooks/use-prompt-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RightsSelector } from "@/components/rights-selector";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The caller's org. For org admins this is the only allowed org (worker
  // enforces). For super admins this is the default pre-fill — they can
  // override the Org field to create a user in any org (including a
  // brand-new one; creating a user with a never-before-seen org slug is
  // how a new org comes into existence).
  callerOrg: string;
  // When true, render the editable Org field and the Super-admin checkbox.
  // When false, the dialog matches the original org-admin shape exactly.
  callerIsSuperAdmin: boolean;
  onCreated?: (email: string) => void;
}

// New users default to no access on every axis — matches the pre-PR-1
// "[]" default for `language_rights`. Admin must explicitly grant.
const EMPTY_RIGHTS: LanguageRights = [];

export function AdminUserCreateDialog({
  open,
  onOpenChange,
  callerOrg,
  callerIsSuperAdmin,
  onCreated,
}: CreateUserDialogProps) {
  const createUser = useCreateAdminUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [org, setOrg] = useState(callerOrg);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [langEdit, setLangEdit] = useState<LanguageRights>(EMPTY_RIGHTS);
  const [langPublish, setLangPublish] = useState<LanguageRights>(EMPTY_RIGHTS);
  const [modeEdit, setModeEdit] = useState<LanguageRights>(EMPTY_RIGHTS);
  const [modePublish, setModePublish] = useState<LanguageRights>(EMPTY_RIGHTS);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Item lists scoped to the TARGET org. For super-admins typing a
  // new org slug, the lists refetch as `org` changes so verb-perms
  // are granted against names that actually exist in the destination
  // (#181 review F8). React Query caches by query key, so re-typing
  // the same slug is free.
  const orgForFetch = (callerIsSuperAdmin ? org : callerOrg).trim() || null;
  const languagesQuery = useLanguages(orgForFetch);
  const modesQuery = useModes(orgForFetch);

  // #247: bootstrap the first language draft inline when the target org
  // has none. Without this, "Specific languages" renders an empty chip
  // list and "Full access" is the only non-empty option — an admin who
  // wants to scope the new user to a not-yet-existing language draft is
  // stuck (they can neither pick the language here nor let the new user
  // create it themselves, since a scoped user with `[]` has no create
  // rights on the languages page either).
  const callerUser = useAuthStore((s) => s.user);
  const scaffoldQuery = useLanguageScaffold(orgForFetch);
  const saveLanguage = useSaveLanguage(orgForFetch);

  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapSlug, setBootstrapSlug] = useState("");
  const [bootstrapLabel, setBootstrapLabel] = useState("");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const canBootstrap = canBootstrapLanguage({
    caller: callerUser,
    callerOrg,
    callerIsSuperAdmin,
    targetOrg: orgForFetch,
  });
  const targetOrgHasNoLanguages =
    languagesQuery.isSuccess &&
    (languagesQuery.data?.languages.length ?? 0) === 0;
  const showBootstrap = targetOrgHasNoLanguages && canBootstrap;

  // Re-sync the Org default if callerOrg changes while the dialog is
  // mounted (rare — only on auth changes). Without this, a stale org
  // would persist between dialog opens.
  useEffect(() => {
    setOrg(callerOrg);
  }, [callerOrg]);

  const reset = () => {
    setEmail("");
    setPassword("");
    setName("");
    setOrg(callerOrg);
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setLangEdit(EMPTY_RIGHTS);
    setLangPublish(EMPTY_RIGHTS);
    setModeEdit(EMPTY_RIGHTS);
    setModePublish(EMPTY_RIGHTS);
    setErrorText(null);
    setBootstrapOpen(false);
    setBootstrapSlug("");
    setBootstrapLabel("");
    setBootstrapError(null);
    createUser.reset();
    saveLanguage.reset();
  };

  // Slugify identically to LanguageSelector's handleCreate so a bootstrap
  // draft created here is indistinguishable from one created on the
  // Languages page. The scaffold-readiness gate on the Create button
  // guards against saving a blank doc (Frank P2 on #74).
  const handleBootstrapSubmit = () => {
    setBootstrapError(null);
    const slug = bootstrapSlug
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      setBootstrapError("Enter a slug for the language.");
      return;
    }
    const scaffold = scaffoldQuery.data;
    if (!scaffold) return;
    const label = bootstrapLabel.trim();
    saveLanguage.mutate(
      {
        name: slug,
        body: {
          label: label || undefined,
          document: scaffold.document,
          published: false,
        },
      },
      {
        onSuccess: () => {
          setBootstrapOpen(false);
          setBootstrapSlug("");
          setBootstrapLabel("");
          setBootstrapError(null);
          // Note: no auto-selection of the new slug in the chip list.
          // The admin is deliberately in the middle of a rights matrix
          // and may want to bootstrap two languages before granting
          // either one, or bootstrap without granting at all.
        },
        onError: (err) => setBootstrapError(err.message),
      }
    );
  };

  // Enter inside the bootstrap inputs would otherwise submit the OUTER
  // <form onSubmit={handleSubmit}> and create a half-configured user
  // before the language draft even exists. Intercept and route Enter to
  // the bootstrap submit instead.
  const handleBootstrapKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBootstrapSubmit();
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedOrg = org.trim();

    if (!trimmedEmail || !password || !trimmedName) {
      setErrorText("Email, password, and name are required.");
      return;
    }
    if (callerIsSuperAdmin && !trimmedOrg) {
      setErrorText("Org cannot be empty.");
      return;
    }
    // Reserved by the UI for the "all orgs" filter Select. Without this
    // guard a super admin could create an org with the sentinel slug,
    // which would then be unfilterable on this page.
    if (callerIsSuperAdmin && isReservedOrgSlug(trimmedOrg)) {
      setErrorText("That org slug is reserved by the UI — pick another.");
      return;
    }
    if (password.length < 8) {
      setErrorText("Password must be at least 8 characters.");
      return;
    }

    createUser.mutate(
      {
        email: trimmedEmail,
        password,
        name: trimmedName,
        // Org admins always send their own org (worker enforces anyway);
        // super admins send whatever they typed.
        org: callerIsSuperAdmin ? trimmedOrg : callerOrg,
        isAdmin,
        // Only include the field when the caller is a super admin and
        // checked the box. Sending `false` from a non-super caller would
        // get a 403 from the worker (it rejects any non-undefined
        // isSuperAdmin from org-scoped admins).
        ...(callerIsSuperAdmin && isSuperAdmin ? { isSuperAdmin: true } : {}),
        // Send all four verb-perms explicitly. Omitting any field on a
        // brand-new user would leave the worker fallback computing
        // `undefined ?? undefined === undefined === full access` — silently
        // widening the user's verb scope past what the admin intended.
        language_edit_rights: langEdit,
        language_publish_rights: langPublish,
        mode_edit_rights: modeEdit,
        mode_publish_rights: modePublish,
      },
      {
        onSuccess: (user) => {
          onCreated?.(user.email);
          reset();
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof AdminUsersForbiddenError) {
            setErrorText(err.serverMessage ?? "You don't have permission.");
          } else if (err instanceof AdminUsersRequestError) {
            setErrorText(
              err.serverMessage ?? `Request failed (${err.status}).`
            );
          } else {
            setErrorText(err.message);
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a new user</DialogTitle>
            <DialogDescription>
              {callerIsSuperAdmin ? (
                <>
                  Pick the destination organization. Using a slug that
                  doesn&rsquo;t exist yet creates a brand-new org with this user
                  as its first member.
                </>
              ) : (
                <>
                  The user will be added to the{" "}
                  <span className="text-foreground font-medium">
                    {callerOrg}
                  </span>{" "}
                  organization. Share the password with them out-of-band; they
                  can change it after first sign-in.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-name">Name</Label>
              <Input
                id="new-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>

            {callerIsSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="new-user-org">Organization</Label>
                <Input
                  id="new-user-org"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="org-slug"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Free-text slug. Type the name of an existing org to add the
                  user there, or a new slug to create a fresh org. The
                  mode/language lists below refresh as you type.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-user-password">Initial password</Label>
              <Input
                id="new-user-password"
                type="text"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
              />
              <p className="text-muted-foreground text-xs">
                Visible deliberately so you can copy and share it. The user can
                change it after first sign-in.
              </p>
            </div>

            <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Org admin</div>
                <div className="text-muted-foreground text-xs">
                  {callerIsSuperAdmin
                    ? "Can manage users in their org. Independent of language access."
                    : `Can manage users in ${callerOrg} (this surface). Independent of language access.`}
                </div>
              </div>
            </label>

            {callerIsSuperAdmin && (
              <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
                <input
                  type="checkbox"
                  checked={isSuperAdmin}
                  onChange={(e) => setIsSuperAdmin(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Super admin</div>
                  <div className="text-muted-foreground text-xs">
                    Cross-org powers. Can manage users in any org, grant super
                    admin to others. Use sparingly.
                  </div>
                </div>
              </label>
            )}

            {showBootstrap && (
              <div className="bg-muted/40 space-y-3 rounded-md border border-dashed p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      No language drafts in{" "}
                      <span className="font-mono text-xs">{orgForFetch}</span>{" "}
                      yet
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Create the first draft to grant specific-language access
                      below. You can leave the rights matrix on &ldquo;No
                      access&rdquo; and grant it later.
                    </p>
                  </div>
                  {!bootstrapOpen && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBootstrapOpen(true);
                        setBootstrapError(null);
                      }}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Create draft
                    </Button>
                  )}
                </div>

                {bootstrapOpen && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="bootstrap-lang-slug"
                          className="text-xs"
                        >
                          Name (slug)
                        </Label>
                        <Input
                          id="bootstrap-lang-slug"
                          value={bootstrapSlug}
                          onChange={(e) => setBootstrapSlug(e.target.value)}
                          onKeyDown={handleBootstrapKeyDown}
                          placeholder="e.g. indonesian"
                          className="h-8 text-sm"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="bootstrap-lang-label"
                          className="text-xs"
                        >
                          Display label
                        </Label>
                        <Input
                          id="bootstrap-lang-label"
                          value={bootstrapLabel}
                          onChange={(e) => setBootstrapLabel(e.target.value)}
                          onKeyDown={handleBootstrapKeyDown}
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
                    {bootstrapError && (
                      <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-xs">
                        {bootstrapError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBootstrapOpen(false);
                          setBootstrapError(null);
                        }}
                        disabled={saveLanguage.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleBootstrapSubmit}
                        disabled={
                          !bootstrapSlug.trim() ||
                          saveLanguage.isPending ||
                          !scaffoldQuery.isSuccess
                        }
                      >
                        {saveLanguage.isPending ? "Creating…" : "Create draft"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <RightsSelector
              kind="language"
              verb="edit"
              value={langEdit}
              onChange={setLangEdit}
              availableItems={languagesQuery.data?.languages}
            />
            <RightsSelector
              kind="language"
              verb="publish"
              value={langPublish}
              onChange={setLangPublish}
              availableItems={languagesQuery.data?.languages}
            />
            <RightsSelector
              kind="mode"
              verb="edit"
              value={modeEdit}
              onChange={setModeEdit}
              availableItems={modesQuery.data?.modes}
            />
            <RightsSelector
              kind="mode"
              verb="publish"
              value={modePublish}
              onChange={setModePublish}
              availableItems={modesQuery.data?.modes}
            />

            {errorText && (
              <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                {errorText}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={createUser.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
