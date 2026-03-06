import { type FormEvent, useState } from "react";
import { faCircleXmark } from "@fortawesome/pro-solid-svg-icons";
import { faLockKeyhole } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { changePassword } from "@/lib/auth-api";
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

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
    setSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  }

  function validate(): string | null {
    if (!currentPassword) return "Current password is required";
    if (!newPassword) return "New password is required";
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return `New password must be at least ${String(MIN_PASSWORD_LENGTH)} characters`;
    if (newPassword !== confirmPassword) return "Passwords do not match";
    if (currentPassword === newPassword)
      return "New password must differ from your current password";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => handleOpenChange(false), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const formDisabled = submitting || success;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-6 sm:max-w-sm" showCloseButton={false}>
        {/* Circled X close button hanging off top-right corner */}
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          className="text-primary hover:text-primary/80 dark:text-muted-foreground dark:hover:text-foreground absolute -top-3 -right-3 z-10 transition-colors"
          aria-label="Close"
        >
          <span className="relative flex items-center justify-center">
            <span className="bg-background absolute size-4 rounded-full" />
            <FontAwesomeIcon
              icon={faCircleXmark}
              className="relative text-2xl"
            />
          </span>
        </button>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon
              icon={faLockKeyhole}
              className="text-muted-foreground text-base"
            />
            Change password
          </DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>

        <form
          id="change-password-form"
          onSubmit={(e) => void handleSubmit(e)}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={formDisabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={formDisabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={formDisabled}
            />
          </div>

          {error && (
            <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="border-success/20 bg-success/10 text-success flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Password changed successfully.
            </div>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-password-form"
            className="w-full sm:w-auto"
            disabled={formDisabled}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
