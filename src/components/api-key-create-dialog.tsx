import { useId, useState } from "react";

import type { ApiKeyIssued } from "@/types/api-keys";
import { ApiKeysRequestError } from "@/lib/api-keys-api";
import { API_KEY_ERRORS, API_TERMS_VERSION } from "@/lib/api-keys-wire";
import { useCreateApiKey } from "@/hooks/use-api-keys";
import { ApiKeyReveal } from "@/components/api-key-reveal";
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

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The org the key is for; null = the caller's own org. */
  org: string | null;
  /** Shown in the description so a super admin sees which org they're keying. */
  orgLabel: string;
  /** False when the org hasn't accepted the current terms yet. */
  termsAccepted: boolean;
  termsText: string;
}

// Create a key, then show its plaintext once. While the key is on screen the
// dialog only closes through "Done", so an outside click or Escape can't
// discard it unseen.
export function ApiKeyCreateDialog({
  open,
  onOpenChange,
  org,
  orgLabel,
  termsAccepted,
  termsText,
}: ApiKeyCreateDialogProps) {
  const create = useCreateApiKey(org);
  const [name, setName] = useState("");
  const [app, setApp] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [issued, setIssued] = useState<ApiKeyIssued | null>(null);
  // A 409 means the terms weren't on record after all (another tab, a new
  // version): ask for them here even if the page thought they were accepted.
  const [termsRequired, setTermsRequired] = useState(!termsAccepted);
  const termsId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    if (!name.trim() || !app.trim()) {
      setErrorText("Enter a name and the app this key is for.");
      return;
    }
    if (termsRequired && !agreed) {
      setErrorText("Accept the terms of use to create the key.");
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        app: app.trim(),
        ...(termsRequired ? { acceptTerms: API_TERMS_VERSION } : {}),
      },
      {
        onSuccess: (result) => setIssued(result),
        onError: (err) => {
          if (
            err instanceof ApiKeysRequestError &&
            err.code === API_KEY_ERRORS.termsNotAccepted
          ) {
            setTermsRequired(true);
            setAgreed(false);
            setErrorText("Accept the terms of use to create the key.");
            return;
          }
          setErrorText(err.message || "Couldn't create the key.");
        },
      }
    );
  };

  const revealing = issued !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && create.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!revealing}
        onInteractOutside={(e) => revealing && e.preventDefault()}
        onEscapeKeyDown={(e) => revealing && e.preventDefault()}
      >
        {revealing ? (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>
                For {issued.key.app}. It can take up to a minute to start
                working everywhere.
              </DialogDescription>
            </DialogHeader>
            <ApiKeyReveal apiKey={issued.apiKey} keyName={issued.key.name} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                Done, I&rsquo;ve saved it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                A key lets one app call BT Servant&rsquo;s chat API for{" "}
                <span className="text-foreground font-medium">{orgLabel}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Key name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production"
                  maxLength={100}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key-app">App</Label>
                <Input
                  id="api-key-app"
                  value={app}
                  onChange={(e) => setApp(e.target.value)}
                  placeholder="Translator app for Android"
                  maxLength={100}
                  required
                />
                <p className="text-muted-foreground text-xs">
                  The app that will send requests with this key.
                </p>
              </div>

              {termsRequired && (
                <div className="bg-muted/40 space-y-3 rounded-md border p-3">
                  <p className="text-xs font-semibold tracking-wide uppercase">
                    Terms of use
                  </p>
                  <p id={termsId} className="text-sm leading-relaxed">
                    {termsText}
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      aria-describedby={termsId}
                      className="mt-0.5"
                    />
                    <span>
                      I accept these terms for {orgLabel}. This is recorded with
                      my name and the date.
                    </span>
                  </label>
                </div>
              )}

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
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || (termsRequired && !agreed)}
              >
                {create.isPending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
