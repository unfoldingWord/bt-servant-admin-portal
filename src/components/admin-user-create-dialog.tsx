import { useEffect, useState } from "react";

import type { LanguageRights } from "@/types/auth";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
  isReservedOrgSlug,
} from "@/lib/admin-users-api";
import { useAuthStore } from "@/lib/auth-store";
import { canBootstrapLanguage } from "@/lib/language-bootstrap-gate";
import { useCreateAdminUser } from "@/hooks/use-admin-users";
import { useLanguages } from "@/hooks/use-languages";
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
import { LanguageBootstrapCta } from "@/components/language-bootstrap-cta";
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

  // #247: when the target org has no language drafts, specific-language
  // scope can't be granted here (empty chip list). Rather than create a
  // draft inline, point the admin at the Languages page — the purpose-
  // built home for draft creation — provided they can actually create
  // one there (mirrors the Languages page `canCreate` gate). orgForFetch
  // !== null guards against a super-admin clearing the Org field.
  const callerUser = useAuthStore((s) => s.user);
  const canBootstrap = canBootstrapLanguage({
    caller: callerUser,
    callerOrg,
    callerIsSuperAdmin,
    targetOrg: orgForFetch,
  });
  const targetOrgHasNoLanguages =
    languagesQuery.isSuccess &&
    (languagesQuery.data?.languages.length ?? 0) === 0;
  const showBootstrap =
    orgForFetch !== null && targetOrgHasNoLanguages && canBootstrap;
  // The org-context the Languages page should adopt: the target org for a
  // cross-org super-admin, else null (home org).
  const bootstrapContextOrg =
    callerIsSuperAdmin &&
    orgForFetch !== null &&
    orgForFetch.trim().toLowerCase() !== callerOrg.trim().toLowerCase()
      ? orgForFetch
      : null;

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
    createUser.reset();
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

            {showBootstrap && orgForFetch && (
              <LanguageBootstrapCta
                org={orgForFetch}
                contextOrg={bootstrapContextOrg}
                onNavigateAway={() => handleClose(false)}
              />
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
