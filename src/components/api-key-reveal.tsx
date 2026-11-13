import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ApiKeyRevealProps {
  /** The plaintext key. Shown here once; the portal can never fetch it again. */
  apiKey: string;
  keyName: string;
}

// The one moment a key's plaintext exists in the portal (#354). Selectable
// text plus a copy button, and a warning that reads as a warning: once this
// closes, the key can't be shown again, only rotated or revoked.
export function ApiKeyReveal({ apiKey, keyName }: ApiKeyRevealProps) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 2500);
  };

  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Copy this key now.</span> This is the
          only time it will be shown. If it&rsquo;s lost, rotate the key to get
          a new one.
        </p>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium">
          {keyName}
        </p>
        <div className="bg-muted/50 flex items-stretch overflow-hidden rounded-md border">
          <code
            className="text-foreground flex-1 px-3 py-2.5 font-mono text-[13px] leading-relaxed break-all select-all"
            aria-label="API key"
          >
            {apiKey}
          </code>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void copy()}
            className="h-auto shrink-0 rounded-none border-l px-3"
          >
            {copied === "copied" ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <Copy className="size-4" />
            )}
            <span className="ml-1.5 text-xs">
              {copied === "copied" ? "Copied" : "Copy"}
            </span>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1.5 text-xs" aria-live="polite">
          {copied === "failed"
            ? "Couldn't copy automatically. Select the key and copy it by hand."
            : "Store it in your app's secret settings, never in source code or a public repository."}
        </p>
      </div>
    </div>
  );
}
