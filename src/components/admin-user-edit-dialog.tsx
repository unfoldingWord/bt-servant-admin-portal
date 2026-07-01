import { useEffect, useState } from "react";

import type { AdminUser, UpdateUserBody } from "@/types/admin-users";
import type { LanguageRights } from "@/types/auth";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
  isReservedOrgSlug,
} from "@/lib/admin-users-api";
import { useAuthStore } from "@/lib/auth-store";
import { useUpdateAdminUser } from "@/hooks/use-admin-users";
import { useLanguageBootstrapGate } from "@/hooks/use-language-bootstrap";
import { useLanguages } from "@/hooks/use-languages";
import { useModes } from "@/hooks/use-prompt-config";
import {
  effectiveLanguageEditRights,
  effectiveLanguagePublishRights,
  effectiveModeEditRights,
  effectiveModePublishRights,
} from "@/lib/permissions";
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

interface EditUserDialogProps {
  user: AdminUser | null;
  // Indicates the dialog is open. Closing happens via setUser(null) in the
  // parent — keeps a single source of truth (the selected user).
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Email of the currently logged-in admin. Used to disable self-mutation
  // controls (the worker also enforces these — UI just prevents the obvious
  // footgun before the request goes out).
  callerEmail: string;
  // When true, render the editable Org field (move-org) and the
  // Super-admin checkbox. When false, the dialog matches the original
  // org-admin shape exactly.
  callerIsSuperAdmin: boolean;
}

// Comparable normal form for LanguageRights — undefined → null, arrays
// sorted so server-stored unsorted ["spanish","english"] doesn't diff
// against selector-sorted ["english","spanish"] and trigger a spurious
// PUT on a no-op click. JSON.stringify of the normalized form is the
// equality test the dialog uses to decide what to send.
function normRights(value: LanguageRights | undefined): string {
  if (value === undefined) return "null";
  if (value === "*") return '"*"';
  return JSON.stringify([...value].sort());
}

function diffRights(
  current: LanguageRights | undefined,
  next: LanguageRights | undefined
): boolean {
  return normRights(current) !== normRights(next);
}

export function AdminUserEditDialog({
  user,
  open,
  onOpenChange,
  callerEmail,
  callerIsSuperAdmin,
}: EditUserDialogProps) {
  const updateUser = useUpdateAdminUser();

  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [langEdit, setLangEdit] = useState<LanguageRights | undefined>(
    undefined
  );
  const [langPublish, setLangPublish] = useState<LanguageRights | undefined>(
    undefined
  );
  const [modeEdit, setModeEdit] = useState<LanguageRights | undefined>(
    undefined
  );
  const [modePublish, setModePublish] = useState<LanguageRights | undefined>(
    undefined
  );
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  // Item lists are scoped to the TARGET user's org, not the caller's
  // home org. For super-admins moving a user to a different org (#181
  // review F8), this means the selector lists the destination org's
  // modes/languages — granting names that exist in the target namespace.
  // For org admins the user.org always equals callerOrg, so this is
  // identical to the pre-fix behavior.
  const orgForFetch = user?.org ?? null;
  const languagesQuery = useLanguages(orgForFetch);
  const modesQuery = useModes(orgForFetch);

  // #247: same empty-drafts CTA as the create dialog — if the target
  // user's org has zero language drafts, an admin trying to grant
  // specific-language access here hits the same wall, just one dialog
  // later. Point them at the Languages page rather than creating a draft
  // inline (the shared hook keeps both surfaces in step — rd-4 F3).
  //
  // Anchor the gate to the CALLER's home org: the CTA targets the user's
  // current org (`orgForFetch = user.org`), and only a cross-org super-
  // admin can create there without per-row rights. `orgForFetch` is what
  // the CTA names; a super-admin mid-move-org edit is a pre-existing
  // wrinkle the rights selectors already inherit (they too scope to
  // user.org, not the edited Org field) — rd-4 F2, out of #247 scope.
  const callerHomeOrg = useAuthStore((s) => s.user?.org ?? "");
  const { showBootstrap, isCrossOrg } = useLanguageBootstrapGate({
    callerOrg: callerHomeOrg,
    callerIsSuperAdmin,
    targetOrg: orgForFetch,
  });

  // Re-sync form state from the user prop whenever the target changes
  // (or the dialog reopens with a different user).
  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setOrg(user.org);
    setIsAdmin(user.isAdmin);
    setIsSuperAdmin(user.isSuperAdmin ?? false);
    // Populate from the worker-effective rights — applies the
    // partner-aware rule (one explicit verb makes the unset partner
    // []) so the dialog shows what the worker actually sees, not the
    // raw stored value (Frank rd-2 P1).
    setLangEdit(effectiveLanguageEditRights(user));
    setLangPublish(effectiveLanguagePublishRights(user));
    setModeEdit(effectiveModeEditRights(user));
    setModePublish(effectiveModePublishRights(user));
    setPassword("");
    setErrorText(null);
    updateUser.reset();
    // updateUser is a stable reference from React Query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isSelf = user?.email === callerEmail;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorText(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorText("Name cannot be empty.");
      return;
    }
    const trimmedOrg = org.trim();
    if (callerIsSuperAdmin && !trimmedOrg) {
      setErrorText("Org cannot be empty.");
      return;
    }
    // Reserved by the UI for the "all orgs" filter Select — refuse to
    // move a user into the sentinel slug. (Same guard as the create
    // dialog; see ORG_FILTER_ALL_SENTINEL in lib/admin-users-api.)
    if (callerIsSuperAdmin && isReservedOrgSlug(trimmedOrg)) {
      setErrorText("That org slug is reserved by the UI — pick another.");
      return;
    }

    const body: UpdateUserBody = {};
    if (trimmedName !== user.name) body.name = trimmedName;
    if (callerIsSuperAdmin && trimmedOrg !== user.org) body.org = trimmedOrg;
    if (isAdmin !== user.isAdmin) body.isAdmin = isAdmin;
    if (callerIsSuperAdmin && isSuperAdmin !== (user.isSuperAdmin ?? false)) {
      body.isSuperAdmin = isSuperAdmin;
    }

    // Send BOTH verb-perms when either changed (#181 review F2). The
    // worker's partner-aware deny rule treats an unset verb-perm as
    // `[]` whenever the partner is explicit, so a partial save would
    // silently strip access on the verb the admin didn't touch.
    // Persisting both with their effective initial state preserves
    // admin intent exactly. Initial values come from the worker-
    // effective helpers (Frank rd-2 P1) so the diff is against what
    // the worker ACTUALLY sees, not the raw stored shape.
    const initialLangEdit = effectiveLanguageEditRights(user);
    const initialLangPublish = effectiveLanguagePublishRights(user);
    const langEditChanged = diffRights(initialLangEdit, langEdit);
    const langPublishChanged = diffRights(initialLangPublish, langPublish);
    if (langEditChanged || langPublishChanged) {
      if (langEdit !== undefined) body.language_edit_rights = langEdit;
      if (langPublish !== undefined) body.language_publish_rights = langPublish;
    }

    const initialModeEdit = effectiveModeEditRights(user);
    const initialModePublish = effectiveModePublishRights(user);
    const modeEditChanged = diffRights(initialModeEdit, modeEdit);
    const modePublishChanged = diffRights(initialModePublish, modePublish);
    if (modeEditChanged || modePublishChanged) {
      if (modeEdit !== undefined) body.mode_edit_rights = modeEdit;
      if (modePublish !== undefined) body.mode_publish_rights = modePublish;
    }

    // Password is opt-in: only include when the admin actually typed
    // something. Empty = leave the existing hash alone. Mirror the
    // server's 8-char floor (worker rejects shorter with 400).
    if (password) {
      if (password.length < 8) {
        setErrorText("Password must be at least 8 characters.");
        return;
      }
      body.password = password;
    }

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }

    updateUser.mutate(
      { email: user.email, body },
      {
        onSuccess: () => {
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

  if (!user) return null;

  // Legacy hint only fires for users who have no language rights of
  // any kind set. Modes deliberately skip the hint: pre-#181 non-
  // admins had no per-mode access (the gate was admin-only), so
  // "currently full access by default" copy would describe a
  // privilege that never existed.
  const showLegacyLang =
    user.language_edit_rights === undefined &&
    user.language_publish_rights === undefined &&
    user.language_rights === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              <span className="text-foreground font-medium">{user.email}</span>{" "}
              · {user.org}
              {isSelf && (
                <>
                  {" "}
                  · <span className="font-medium">that&rsquo;s you</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Name</Label>
              <Input
                id="edit-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {callerIsSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="edit-user-org">Organization</Label>
                <Input
                  id="edit-user-org"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="org-slug"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Changing this moves the user to a different org. Typing a new
                  slug creates that org with this user as a member.
                </p>
              </div>
            )}

            <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60">
              <input
                type="checkbox"
                checked={isAdmin}
                // Org admins can't self-demote isAdmin (worker rejects
                // with 400). Super admins can — they keep cross-org powers
                // via isSuperAdmin.
                disabled={isSelf && !callerIsSuperAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Org admin</div>
                <div className="text-muted-foreground text-xs">
                  {isSelf && !callerIsSuperAdmin
                    ? "You cannot demote yourself. Use the X-Admin-Secret CLI if you really need to."
                    : "Can manage users in this org. Independent of language access."}
                </div>
              </div>
            </label>

            {callerIsSuperAdmin && (
              <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60">
                <input
                  type="checkbox"
                  checked={isSuperAdmin}
                  // The worker rejects self-demote of isSuperAdmin with
                  // 400 (would lock the caller out of cross-org powers).
                  // Disabling when isSelf && currently-super surfaces that
                  // boundary up-front rather than after a failed PUT.
                  disabled={isSelf && isSuperAdmin}
                  onChange={(e) => setIsSuperAdmin(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Super admin</div>
                  <div className="text-muted-foreground text-xs">
                    {isSelf && isSuperAdmin
                      ? "You cannot demote yourself from super admin. Use the X-Admin-Secret CLI if you really need to."
                      : "Cross-org powers. Can manage users in any org, grant super admin to others."}
                  </div>
                </div>
              </label>
            )}

            {showBootstrap && orgForFetch && (
              <LanguageBootstrapCta
                org={orgForFetch}
                mode={isCrossOrg ? "switch-org" : "direct"}
              />
            )}

            <RightsSelector
              kind="language"
              verb="edit"
              value={langEdit}
              onChange={setLangEdit}
              availableItems={languagesQuery.data?.languages}
              showLegacyHint={showLegacyLang}
            />
            <RightsSelector
              kind="language"
              verb="publish"
              value={langPublish}
              onChange={setLangPublish}
              availableItems={languagesQuery.data?.languages}
              showLegacyHint={showLegacyLang}
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

            <div className="space-y-2">
              <Label htmlFor="edit-user-password">Reset password</Label>
              <Input
                id="edit-user-password"
                type="text"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current"
              />
              <p className="text-muted-foreground text-xs">
                {isSelf ? (
                  <>
                    Sets a new password for your account. Your other sessions
                    are signed out; this tab keeps working.
                  </>
                ) : (
                  <>
                    Sets a new password and signs the user out of every active
                    session. Share the new password with them out-of-band.
                  </>
                )}
              </p>
            </div>

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
              onClick={() => onOpenChange(false)}
              disabled={updateUser.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
