import { useState } from "react";

import type { ApiKey, ApiKeyIssued } from "@/types/api-keys";
import { ROTATION_GRACE_OPTIONS } from "@/lib/api-keys-wire";
import { useRotateApiKey } from "@/hooks/use-api-keys";
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

interface ApiKeyRotateDialogProps {
  apiKey: ApiKey | null;
  onClose: () => void;
}

// Replace a key with a new one (same name, app and org), then show the new
// key once. The old key can keep working for a grace period so the partner's
// live app has time to switch.
export function ApiKeyRotateDialog({
  apiKey,
  onClose,
}: ApiKeyRotateDialogProps) {
  const rotate = useRotateApiKey();
  const [grace, setGrace] = useState<number>(ROTATION_GRACE_OPTIONS[0].seconds);
  // The grace actually sent, so the confirmation can't describe a choice
  // changed after submitting.
  const [submittedGrace, setSubmittedGrace] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [issued, setIssued] = useState<ApiKeyIssued | null>(null);
  const revealing = issued !== null;

  const handleRotate = () => {
    if (!apiKey) return;
    setErrorText(null);
    setSubmittedGrace(grace);
    rotate.mutate(
      { id: apiKey.id, graceSeconds: grace },
      {
        onSuccess: (result) => setIssued(result),
        onError: (err) =>
          setErrorText(err.message || "Couldn't rotate the key."),
      }
    );
  };

  return (
    <Dialog
      open={apiKey !== null}
      onOpenChange={(next) => {
        if (!next && !rotate.isPending) onClose();
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
              <DialogTitle>Your replacement key</DialogTitle>
              <DialogDescription>
                {(submittedGrace ?? grace) > 0
                  ? "The old key keeps working until its grace period ends. Switch the app to this key before then."
                  : "The old key has stopped working. Switch the app to this key now."}
              </DialogDescription>
            </DialogHeader>
            <ApiKeyReveal apiKey={issued.apiKey} keyName={issued.key.name} />
            <DialogFooter>
              <Button onClick={onClose}>Done, I&rsquo;ve saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Rotate key?</DialogTitle>
              <DialogDescription>
                {apiKey && (
                  <>
                    This issues a replacement for{" "}
                    <span className="text-foreground font-medium">
                      {apiKey.name}
                    </span>
                    , used by {apiKey.app}. The app&rsquo;s users keep their
                    chat history.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                What happens to the old key
              </legend>
              {ROTATION_GRACE_OPTIONS.map((opt) => (
                <label
                  key={opt.seconds}
                  className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  <input
                    type="radio"
                    name="rotation-grace"
                    checked={grace === opt.seconds}
                    onChange={() => setGrace(opt.seconds)}
                    disabled={rotate.isPending}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
            {errorText && (
              <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
                {errorText}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={rotate.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleRotate} disabled={rotate.isPending}>
                {rotate.isPending ? "Rotating…" : "Rotate key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
