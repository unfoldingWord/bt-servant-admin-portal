import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";

import { downloadBlob } from "@/lib/download-blob";
import type { ModeFlags } from "@/lib/mode-flags";
import {
  buildModeShareFilename,
  resolveModeSharePanelState,
  type ModeSharePanelState,
} from "@/lib/mode-share-link";
import {
  QR_DARK,
  QR_LIGHT,
  buildQrMatrix,
  buildQrSvg,
  qrPathData,
  qrViewBoxSize,
} from "@/lib/mode-share-qr";
import { humanizeModeSlug } from "@/lib/mode-slug";
import { cn } from "@/lib/utils";
import { useShareConfig } from "@/hooks/use-share-config";
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

// #311 — per-mode WhatsApp QR. The card in the middle is the deliverable:
// a partner prints it or holds it up on a phone, someone scans it, WhatsApp
// opens on BT Servant with `#<slug>` ready to send. Everything around the
// card exists to get the card into the world (copy the link, download it)
// or to say plainly why it would not work yet. Which of those it is comes
// from `resolveModeSharePanelState` (pure, unit-tested); this file renders.

interface ModeSharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modeName: string;
  modeLabel?: string;
  /** Effective org of the mode being viewed (cross-org aware). */
  org: string | null;
  /** Server-truth flag pair — the page's `lastSyncedFlags`, not the cache. */
  flags: ModeFlags;
}

const PNG_SIZE_PX = 1024;
const PNG_FAIL = "Couldn't render the PNG. Download the SVG instead.";

export function ModeSharePanel({
  open,
  onOpenChange,
  modeName,
  modeLabel,
  org,
  flags,
}: ModeSharePanelProps) {
  // Fetch only once the panel has been opened; the result is cached for
  // the session, so later opens are instant.
  const shareConfig = useShareConfig(open);

  const state = useMemo<ModeSharePanelState>(() => {
    const data = shareConfig.data;
    return resolveModeSharePanelState(
      {
        pending: shareConfig.isPending,
        error: shareConfig.isError,
        supported: data?.supported === true,
        whatsappNumber: data?.supported ? data.config.whatsappNumber : null,
        whatsappOrg: data?.supported ? data.config.whatsappOrg : null,
      },
      flags,
      org,
      modeName
    );
  }, [
    flags,
    modeName,
    org,
    shareConfig.data,
    shareConfig.isError,
    shareConfig.isPending,
  ]);

  // Secondary note for a mode that is not ready for its own reasons AND
  // has no number configured — so the author who publishes is not sent
  // around the loop a second time to discover the operator half.
  const numberMissing =
    !shareConfig.isPending &&
    !shareConfig.isError &&
    !(shareConfig.data?.supported && shareConfig.data.config.whatsappNumber);

  const title = modeLabel?.trim() || humanizeModeSlug(modeName);
  const trigger = `#${modeName}`;

  const ready = state.kind === "ready";
  const matrix = useMemo(
    () => (state.kind === "ready" ? buildQrMatrix(state.url) : null),
    [state]
  );
  // Built on click, not per render: the on-screen code is React markup and
  // only a download needs the standalone document.
  const buildDownloadSvg = useCallback(
    () =>
      matrix
        ? buildQrSvg(matrix, {
            sizePx: PNG_SIZE_PX,
            title: `${title} — BT Servant on WhatsApp (${trigger})`,
          })
        : null,
    [matrix, title, trigger]
  );

  // --- copy / download feedback --------------------------------------
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setCopyError(null);
      setDownloadError(null);
    }
  }, [open]);

  const handleCopy = useCallback(async () => {
    if (state.kind !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopyError("Couldn't copy. Select the link below and copy it by hand.");
    }
  }, [state]);

  // --- download -------------------------------------------------------
  const handleDownloadSvg = useCallback(() => {
    const svg = buildDownloadSvg();
    if (!svg) return;
    downloadBlob(
      new Blob([svg], { type: "image/svg+xml" }),
      buildModeShareFilename(org ?? "org", modeName, "svg")
    );
  }, [buildDownloadSvg, modeName, org]);

  // The in-flight rasterisation. A generation counter, not just the <img>:
  // `canvas.toBlob` is itself async, so its callback has to check it still
  // belongs to the live job before it downloads or reports anything. Closing
  // the dialog, unmounting, or clicking again all retire the current job.
  const pngJobRef = useRef<{
    id: number;
    img: HTMLImageElement;
    url: string;
  } | null>(null);
  const pngGenRef = useRef(0);
  const cancelPngJob = useCallback(() => {
    const job = pngJobRef.current;
    if (!job) return;
    job.img.onload = null;
    job.img.onerror = null;
    URL.revokeObjectURL(job.url);
    pngJobRef.current = null;
    pngGenRef.current += 1;
  }, []);
  useEffect(() => cancelPngJob, [cancelPngJob]);
  useEffect(() => {
    if (!open) cancelPngJob();
  }, [cancelPngJob, open]);

  const handleDownloadPng = useCallback(() => {
    const svg = buildDownloadSvg();
    if (!svg) return;
    setDownloadError(null);
    cancelPngJob();
    // Rasterise through an <img> so the PNG is the same document as the
    // SVG download — one renderer, one geometry, no drift between formats.
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    const id = ++pngGenRef.current;
    pngJobRef.current = { id, img, url };
    const isLive = () => pngJobRef.current?.id === id;
    const finish = () => {
      if (isLive()) pngJobRef.current = null;
      URL.revokeObjectURL(url);
    };
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = PNG_SIZE_PX;
        canvas.height = PNG_SIZE_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, PNG_SIZE_PX, PNG_SIZE_PX);
        canvas.toBlob((blob) => {
          // Retired by a close, unmount, or a newer click: say nothing.
          if (pngGenRef.current !== id) return;
          pngJobRef.current = null;
          if (!blob) {
            setDownloadError(PNG_FAIL);
            return;
          }
          downloadBlob(
            blob,
            buildModeShareFilename(org ?? "org", modeName, "png")
          );
        }, "image/png");
      } catch {
        setDownloadError(PNG_FAIL);
      } finally {
        // The blob URL is consumed once drawImage has run; the job itself
        // stays live until toBlob reports back.
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      setDownloadError(PNG_FAIL);
      finish();
    };
    img.src = url;
  }, [buildDownloadSvg, cancelPngJob, modeName, org]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share on WhatsApp</DialogTitle>
          {/* Stable description (Radix reads it once, on open). What changes
              — settings loaded, code ready, or why not — lives in the status
              region below, same split as the priorities panel. */}
          <DialogDescription>
            A QR code and link that open this mode in WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <p
          role="status"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          className="text-muted-foreground -mt-2 text-sm"
        >
          {describe(state, org, trigger)}
        </p>

        {/* The card. Always white, in dark mode too: it is the thing that
            gets printed and scanned, and a scanner wants black on white. The
            3px top strip is the Modes accent (#78) so it reads as one of
            ours on paper as well as on screen. */}
        <div
          className="mx-auto w-full max-w-[19rem] overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-sm"
          style={{ borderTopWidth: 3, borderTopColor: "var(--brand-modes)" }}
        >
          <div className="px-5 pt-4">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-neutral-500 uppercase">
              BT Servant · WhatsApp
            </p>
            <p className="mt-1 truncate text-base font-semibold" title={title}>
              {title}
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="aspect-square w-full">
              {matrix ? (
                <QrSvg
                  matrix={matrix}
                  label={`QR code that opens WhatsApp with ${trigger} ready to send`}
                />
              ) : (
                // Decorative: the live description above carries the same
                // words, so this is hidden to avoid a double announcement.
                <div
                  className="flex size-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400"
                  aria-hidden="true"
                >
                  <QrCode className="size-8" strokeWidth={1.25} />
                  <span className="text-xs font-medium tracking-wide">
                    {placeholderLabel(state)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div
            className={cn(
              "border-t border-dashed border-neutral-200 px-5 py-3 text-center font-mono text-lg font-medium tracking-tight",
              !ready && "text-neutral-400"
            )}
          >
            {trigger}
          </div>
        </div>

        {state.kind === "error" && (
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void shareConfig.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {state.kind === "ready" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {/* Read-only input, not <code>: focusable, fully selectable,
                  and scrolls instead of truncating — the manual fallback
                  when the clipboard API is unavailable. */}
              <Input
                readOnly
                value={state.url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 min-w-0 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopy()}
                aria-label={copied ? "Link copied" : "Copy link"}
                className="shrink-0"
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copied ? "Link copied" : ""}
            </span>
            {copyError && (
              <p className="text-destructive text-xs" role="alert">
                {copyError}
              </p>
            )}
            {state.orgUnverified && (
              <p className="text-muted-foreground text-xs">
                The WhatsApp gateway's org isn't configured for this
                environment, so the org check was skipped — the code is shown as
                ready without it.
              </p>
            )}
          </div>
        )}

        {!ready && numberMissing && state.kind !== "unconfigured" && (
          <p className="text-muted-foreground text-xs">
            Also: the WhatsApp number isn't configured for this environment yet,
            so the code can't be generated until it is.
          </p>
        )}

        {downloadError && (
          <p className="text-destructive text-xs" role="alert">
            {downloadError}
          </p>
        )}

        {state.kind === "ready" && (
          <DialogFooter className="sm:justify-between">
            <Button size="sm" variant="ghost" asChild>
              <a href={state.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open in WhatsApp
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownloadSvg}>
                <Download />
                Download SVG
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadPng}>
                <Download />
                Download PNG
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QrSvg({
  matrix,
  label,
}: {
  matrix: ReturnType<typeof buildQrMatrix>;
  label: string;
}) {
  const box = qrViewBoxSize(matrix);
  const d = useMemo(() => qrPathData(matrix), [matrix]);
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      className="size-full"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={box} height={box} fill={QR_LIGHT} />
      <path d={d} fill={QR_DARK} />
    </svg>
  );
}

function describe(
  state: ModeSharePanelState,
  org: string | null,
  trigger: string
) {
  switch (state.kind) {
    case "loading":
      return "Checking the WhatsApp settings…";
    case "error":
      return "Couldn't load the WhatsApp settings.";
    case "unconfigured":
      return "WhatsApp number not configured. Set WHATSAPP_NUMBER for this environment to generate share codes.";
    case "number-invalid":
      return "The configured WhatsApp number isn't a valid E.164 number. Check WHATSAPP_NUMBER for this environment.";
    case "slug-invalid":
      return "This mode's name can't be encoded as a trigger. Rename it to lowercase letters, digits, and hyphens to share it by QR.";
    case "slug-reserved":
      return `“${trigger}” is reserved — WhatsApp users type it to leave a mode, so a code for it would switch them off instead of on. Rename the mode to share it by QR.`;
    case "org-mismatch":
      return `Not reachable from WhatsApp. BT Servant's WhatsApp number is connected to the ${state.whatsappOrg} org; this mode belongs to ${org ?? "another org"}.`;
    case "group-only":
      return "Group chat only. This mode is hidden from WhatsApp direct messages — turn off “Requires group chat” to share it by QR.";
    case "draft":
      return "Publish to activate. Drafts are hidden from WhatsApp, so this code won't work until the mode is published.";
    case "ready":
      return `Scan with a phone camera to open WhatsApp with ${trigger} ready to send. Print the card, or share the link.`;
  }
}

function placeholderLabel(state: ModeSharePanelState): string {
  switch (state.kind) {
    case "loading":
      return "Loading";
    case "error":
      return "Unavailable";
    case "unconfigured":
      return "Number not configured";
    case "number-invalid":
      return "Number invalid";
    case "slug-invalid":
    case "slug-reserved":
      return "Can't encode this name";
    case "org-mismatch":
      return "Not reachable";
    case "group-only":
      return "Group chat only";
    case "draft":
      return "Publish to activate";
    case "ready":
      return "";
  }
}
