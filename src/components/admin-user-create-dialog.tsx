import { useState } from "react";

import type { Language } from "@/types/language";
import type { LanguageRights } from "@/types/auth";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
} from "@/lib/admin-users-api";
import { useCreateAdminUser } from "@/hooks/use-admin-users";
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

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The caller's org. Pre-fills the form and is the only allowed value
  // for org-scoped admins (the worker enforces this regardless).
  callerOrg: string;
  availableLanguages: Language[] | undefined;
  onCreated?: (email: string) => void;
}

export function AdminUserCreateDialog({
  open,
  onOpenChange,
  callerOrg,
  availableLanguages,
  onCreated,
}: CreateUserDialogProps) {
  const createUser = useCreateAdminUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [rights, setRights] = useState<LanguageRights>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setPassword("");
    setName("");
    setIsAdmin(false);
    setRights([]);
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

    if (!trimmedEmail || !password || !trimmedName) {
      setErrorText("Email, password, and name are required.");
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
        org: callerOrg,
        isAdmin,
        language_rights: rights,
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
              The user will be added to the{" "}
              <span className="text-foreground font-medium">{callerOrg}</span>{" "}
              organization. Share the password with them out-of-band; they can
              change it after first sign-in.
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
                  Can manage users in {callerOrg} (this surface). Independent of
                  language access.
                </div>
              </div>
            </label>

            <LanguageRightsSelector
              value={rights}
              onChange={setRights}
              availableLanguages={availableLanguages}
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
