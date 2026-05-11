import { useEffect, useState } from "react";

import type { AdminUser, UpdateUserBody } from "@/types/admin-users";
import type { LanguageRights } from "@/types/auth";
import type { Language } from "@/types/language";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
} from "@/lib/admin-users-api";
import { useUpdateAdminUser } from "@/hooks/use-admin-users";
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
import { LanguageRightsSelector } from "@/components/language-rights-selector";

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
  availableLanguages: Language[] | undefined;
}

export function AdminUserEditDialog({
  user,
  open,
  onOpenChange,
  callerEmail,
  availableLanguages,
}: EditUserDialogProps) {
  const updateUser = useUpdateAdminUser();

  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [rights, setRights] = useState<LanguageRights | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  // Re-sync form state from the user prop whenever the target changes
  // (or the dialog reopens with a different user).
  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setIsAdmin(user.isAdmin);
    setRights(user.language_rights);
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

    const body: UpdateUserBody = {};
    if (trimmedName !== user.name) body.name = trimmedName;
    if (isAdmin !== user.isAdmin) body.isAdmin = isAdmin;
    // Send language_rights when the value differs. Comparing arrays needs
    // a deep compare; we serialize.
    const currentSerialized = JSON.stringify(user.language_rights ?? null);
    const nextSerialized = JSON.stringify(rights ?? null);
    if (currentSerialized !== nextSerialized && rights !== undefined) {
      body.language_rights = rights;
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

            <label className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60">
              <input
                type="checkbox"
                checked={isAdmin}
                disabled={isSelf}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Org admin</div>
                <div className="text-muted-foreground text-xs">
                  {isSelf
                    ? "You cannot demote yourself. Use the X-Admin-Secret CLI if you really need to."
                    : "Can manage users in this org. Independent of language access."}
                </div>
              </div>
            </label>

            <LanguageRightsSelector
              value={rights}
              onChange={setRights}
              availableLanguages={availableLanguages}
              showLegacyHint
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
