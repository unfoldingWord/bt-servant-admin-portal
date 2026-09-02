import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";

import type { ModeFlags } from "@/lib/mode-flags";
import {
  buildModeShareFilename,
  buildModeShareLink,
  modeShareState,
} from "@/lib/mode-share-link";
import {
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

// #311 — per-mode WhatsApp QR. The card in the middle is the deliverable:
// a partner prints it or holds it up on a phone, someone scans it, WhatsApp
// opens on BT Servant with `#<slug>` ready to send. Everything around the
// card exists to get the card into the world (copy the link, download it)
// or to say plainly why it would not work yet.

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

type PanelState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unconfigured" }
  | { kind: "number-invalid" }
  | { kind: "org-mismatch"; whatsappOrg: string }
  | { kind: "group-only" }
  | { kind: "draft" }
  | { kind: "ready"; url: string; trigger: string };

const PNG_SIZE_PX = 1024;

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
  const config = shareConfig.data?.supported ? shareConfig.data.config : null;

  const state = useMemo<PanelState>(() => {
    if (shareConfig.isPending) return { kind: "loading" };
    if (shareConfig.isError) return { kind: "error" };
    // Hardest constraint first, and the ones the mode's own author can fix
    // before the ones only an operator can. A draft with no number set
    // still reads "Publish to activate" — the note below carries the rest.
    const eligibility = modeShareState(flags, org, config?.whatsappOrg);
    if (eligibility === "org-mismatch") {
      return { kind: "org-mismatch", whatsappOrg: config?.whatsappOrg ?? "" };
    }
    if (eligibility !== "ready") return { kind: eligibility };
    const link = buildModeShareLink(config?.whatsappNumber, modeName);
    if (link.ok) return { kind: "ready", url: link.url, trigger: link.trigger };
    if (link.reason === "number-invalid") return { kind: "number-invalid" };
    // `slug-invalid` cannot happen for a mode the worker accepted, but the
    // panel must still say something true if it ever does.
    return { kind: "unconfigured" };
  }, [
    config,
    flags,
    modeName,
    org,
    shareConfig.isError,
    shareConfig.isPending,
  ]);

  const numberMissing =
    !shareConfig.isPending && !shareConfig.isError && !config?.whatsappNumber;

  const matrix = useMemo(
    () => (state.kind === "ready" ? buildQrMatrix(state.url) : null),
    [state]
  );

  const title = modeLabel?.trim() || humanizeModeSlug(modeName);
  const trigger = `#${modeName}`;

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
      setCopyError("Couldn't copy. Select the link and copy it by hand.");
    }
  }, [state]);

  // --- download -------------------------------------------------------
  const svgDocument = useMemo(
    () =>
      matrix
        ? buildQrSvg(matrix, {
            sizePx: PNG_SIZE_PX,
            title: `${title} — BT Servant on WhatsApp (${trigger})`,
          })
        : null,
    [matrix, title, trigger]
  );

  const handleDownloadSvg = useCallback(() => {
    if (!svgDocument) return;
    downloadBlob(
      new Blob([svgDocument], { type: "image/svg+xml" }),
      buildModeShareFilename(org ?? "org", modeName, "svg")
    );
  }, [modeName, org, svgDocument]);

  const handleDownloadPng = useCallback(() => {
    if (!svgDocument) return;
    setDownloadError(null);
    // Rasterise through an <img> so the PNG is the same document as the
    // SVG download — one renderer, one geometry, no drift between formats.
    const objectUrl = URL.createObjectURL(
      new Blob([svgDocument], { type: "image/svg+xml" })
    );
    const img = new Image();
    const fail = () => {
      URL.revokeObjectURL(objectUrl);
      setDownloadError("Couldn't render the PNG. Download the SVG instead.");
    };
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PNG_SIZE_PX;
      canvas.height = PNG_SIZE_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail();
      ctx.drawImage(img, 0, 0, PNG_SIZE_PX, PNG_SIZE_PX);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((blob) => {
        if (!blob) {
          setDownloadError(
            "Couldn't render the PNG. Download the SVG instead."
          );
          return;
        }
        downloadBlob(
          blob,
          buildModeShareFilename(org ?? "org", modeName, "png")
        );
      }, "image/png");
    };
    img.onerror = fail;
    img.src = objectUrl;
  }, [modeName, org, svgDocument]);

  const ready = state.kind === "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share on WhatsApp</DialogTitle>
          <DialogDescription>{describe(state, org, trigger)}</DialogDescription>
        </DialogHeader>

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
              {matrix && ready ? (
                <QrSvg
                  matrix={matrix}
                  label={`QR code that opens WhatsApp with ${trigger} ready to send`}
                />
              ) : (
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

        {ready && (
          <div className="space-y-1.5">
            <div className="bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2">
              <code
                className="text-foreground min-w-0 flex-1 truncate font-mono text-xs"
                title={state.url}
              >
                {state.url}
              </code>
              <Button
                size="xs"
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

        {ready && (
          <DialogFooter className="sm:justify-between">
            <Button size="sm" variant="ghost" asChild>
              <a href={state.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open in WhatsApp
              </a>
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownloadSvg}>
                <Download />
                SVG
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadPng}>
                <Download />
                PNG
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
      <rect width={box} height={box} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

function describe(state: PanelState, org: string | null, trigger: string) {
  switch (state.kind) {
    case "loading":
      return "Checking the WhatsApp settings…";
    case "error":
      return "Couldn't load the WhatsApp settings.";
    case "unconfigured":
      return "WhatsApp number not configured. Set WHATSAPP_NUMBER for this environment to generate share codes.";
    case "number-invalid":
      return "The configured WhatsApp number isn't a valid E.164 number. Check WHATSAPP_NUMBER for this environment.";
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

function placeholderLabel(state: PanelState): string {
  switch (state.kind) {
    case "loading":
      return "Loading";
    case "error":
      return "Unavailable";
    case "unconfigured":
    case "number-invalid":
      return "Number not configured";
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
