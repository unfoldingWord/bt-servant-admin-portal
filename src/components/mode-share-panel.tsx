import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";

import { downloadBlob } from "@/lib/download-blob";
import type { ModeFlags } from "@/lib/mode-flags";
import {
  buildModeShareFilename,
  resolveModeSharePanelState,
  answerUncertain,
  hasUsableWhatsAppNumber,
  homeOrgWithoutModes,
  modeShareState,
  validateModeShareSlug,
  refreshFailed,
  retryControl,
  shownTrigger,
  type ModeSharePanelState,
  type RetryTarget,
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
import type {
  ShareCodeFailure,
  ShareCodeTransient,
} from "@/lib/mode-share-code-api";
import { useModeShareCode } from "@/hooks/use-mode-share-code";
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
// opens on BT Servant with `#<slug>` ready to send (`#<orgslug>/<slug>`
// for a partner org's mode, #345). Everything around the
// card exists to get the card into the world (copy the link, download it)
// or to say plainly why it would not work yet. Which of those it is comes
// from `resolveModeSharePanelState` (pure, unit-tested); this file renders.

/** Content id, so the page's opener can point `aria-controls` at it. */
export const MODE_SHARE_DIALOG_ID = "mode-share-dialog";

interface ModeSharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The control that opened the dialog. It lives outside the Dialog tree
   * (a plain header button, not DialogTrigger), so Radix has no trigger
   * to return focus to on close; we do it ourselves.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  modeName: string;
  modeLabel?: string;
  /** Effective org of the mode being viewed (cross-org aware). */
  org: string | null;
  /**
   * The page's org param (null = the caller's own org): the org its mode
   * queries and writes use, so a mode write invalidates this share code.
   */
  requestOrg: string | null;
  /** Server-truth flag pair — the page's `lastSyncedFlags`, not the cache. */
  flags: ModeFlags;
}

const PNG_SIZE_PX = 1024;
const PNG_FAIL = "Couldn't render the PNG. Download the SVG instead.";

export function ModeSharePanel({
  open,
  onOpenChange,
  modeName: liveModeName,
  modeLabel: liveModeLabel,
  org: liveOrg,
  requestOrg: liveRequestOrg,
  flags: liveFlags,
  returnFocusTo,
}: ModeSharePanelProps) {
  // The one freeze for the close animation. While closing, Radix keeps
  // the content mounted for its exit animation but the page has already
  // dropped the latch (`modeName` is "" and the label/flags may belong to
  // the next selection). The content keeps the props of the last open
  // render, recorded in an effect; with the same props its queries keep
  // their answer (`useModeShareCode` keeps its start while disabled), so
  // the status region and card don't flicker on the way out.
  const live = useMemo(
    () => ({
      modeName: liveModeName,
      modeLabel: liveModeLabel,
      org: liveOrg,
      requestOrg: liveRequestOrg,
      flags: liveFlags,
    }),
    [liveFlags, liveModeLabel, liveModeName, liveOrg, liveRequestOrg]
  );
  const [lastOpen, setLastOpen] = useState(live);
  useEffect(() => {
    if (open) setLastOpen(live);
  }, [live, open]);
  const shown = open ? live : lastOpen;

  // Each open is its own mount of the content (#345): a reopen during the
  // exit animation still gets a fresh one. The share-code query lives in
  // it, so TanStack's per-mount state is per open, and closing (the
  // unmount after the exit animation) cancels a request still in flight.
  const [openCount, setOpenCount] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((n) => n + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={MODE_SHARE_DIALOG_ID}
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current;
          // Null when the opener has unmounted (selection cleared); let
          // Radix fall through to its default rather than focus nothing.
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <ModeShareContent
          key={JSON.stringify([
            openCount,
            shown.org,
            shown.requestOrg,
            shown.modeName,
          ])}
          open={open}
          {...shown}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ModeShareContentProps {
  open: boolean;
  modeName: string;
  modeLabel?: string;
  org: string | null;
  requestOrg: string | null;
  flags: ModeFlags;
}

/** Everything inside the dialog, mounted once per open. */
function ModeShareContent({
  open,
  modeName,
  modeLabel,
  org,
  requestOrg,
  flags,
}: ModeShareContentProps) {
  // Session-cached operator config; asked while open.
  const shareConfig = useShareConfig(open);
  // The worker's answer for which code opens this mode (#345). Not asked
  // for a mode the panel refuses on its own: a slug no trigger can carry
  // (it would only 400), a draft, or a group-only mode. A partner mode
  // the worker would call damaged (`invalid_mode`, which it checks before
  // draft) is skipped here too; that only matters once the mode is
  // published, and the worker reports it then. Nor before share-config
  // shows a usable WhatsApp number: without one no link can be built.
  const configNumber = shareConfig.data?.supported
    ? shareConfig.data.config.whatsappNumber
    : null;
  const shareCode = useModeShareCode(
    open &&
      validateModeShareSlug(modeName) === "ok" &&
      modeShareState(flags) === "ready" &&
      hasUsableWhatsAppNumber(configNumber),
    modeName,
    requestOrg
  );
  const shareCodeSnapshot = shareCode.snapshot;

  const state = useMemo<ModeSharePanelState>(() => {
    const data = shareConfig.data;
    return resolveModeSharePanelState(
      {
        pending: shareConfig.isPending,
        paused: shareConfig.fetchStatus === "paused",
        // A failed refetch over an answer keeps it (TanStack keeps `data`).
        error: shareConfig.isError && data === undefined,
        supported: data?.supported === true,
        whatsappNumber: data?.supported ? data.config.whatsappNumber : null,
      },
      shareCodeSnapshot,
      flags,
      org,
      modeName
    );
  }, [
    flags,
    modeName,
    org,
    shareCodeSnapshot,
    shareConfig.data,
    shareConfig.fetchStatus,
    shareConfig.isError,
    shareConfig.isPending,
  ]);

  // Secondary note for a mode the author can still fix (publish it, or
  // turn off group-only) while the number is ALSO missing, so they are not
  // sent around the loop a second time to discover the operator half.
  // Only there: in a loading, error or org state the number isn't the
  // problem to raise.
  // Only once share-config has actually loaded: while it is loading or
  // failed, nothing is known about the number.
  const numberMissing =
    (state.kind === "draft" || state.kind === "group-only") &&
    shareConfig.isSuccess &&
    !(shareConfig.data.supported && shareConfig.data.config.whatsappNumber);

  // Beside whatever the state is: the gateway org has no modes at all.
  const emptyHomeOrg = homeOrgWithoutModes(shareCodeSnapshot.answer);
  const showRefreshFailed = refreshFailed(state, shareCodeSnapshot);

  // Try again (see `retryControl`): busy from the click until that
  // refetch's promise settles. A query paused offline isn't busy (its
  // promise waits for the network), so Try again stays usable while the
  // panel says to check the connection. Closing drops it with this mount.
  const [retryBusy, setRetryBusy] = useState<RetryTarget | null>(null);
  const busyStatus =
    retryBusy === "config"
      ? shareConfig.fetchStatus
      : retryBusy === "share-code"
        ? shareCode.fetchStatus
        : null;
  const retry = retryControl(
    state,
    shareCodeSnapshot,
    busyStatus === "paused" ? null : retryBusy
  );
  const runRetry = (target: RetryTarget) => {
    setRetryBusy(target);
    const refetch =
      target === "config" ? shareConfig.refetch() : shareCode.refetch();
    void refetch.finally(() => setRetryBusy(null));
  };

  const title = modeLabel?.trim() || humanizeModeSlug(modeName);
  // What every surface shows (card, QR label, SVG title, copy): only ever
  // a code the worker returned. Null otherwise, so no guessed trigger.
  const shown = shownTrigger(state);
  const trigger = shown?.trigger ?? null;
  const partnerOrg = shown?.partnerOrg ?? null;

  const ready = state.kind === "ready";
  // Keyed on the URL string, not the state object: a background refresh
  // that returns the same code mustn't rebuild the QR.
  const qrUrl = state.kind === "ready" ? state.url : null;
  const matrix = useMemo(
    () => (qrUrl === null ? null : buildQrMatrix(qrUrl)),
    [qrUrl]
  );
  // Built on click, not per render: the on-screen code is React markup and
  // only a download needs the standalone document.
  const buildDownloadSvg = useCallback(
    () =>
      matrix
        ? buildQrSvg(matrix, {
            sizePx: PNG_SIZE_PX,
            title: `${title} — BT Servant on WhatsApp (${trigger ?? ""})`,
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
    <>
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
        aria-busy={
          state.kind === "loading-config" || state.kind === "checking-code"
        }
        className="text-muted-foreground -mt-2 text-sm"
      >
        {describe(state, modeName)}
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
                label={`QR code that opens WhatsApp with ${trigger ?? ""} ready to send`}
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
        {trigger && (
          <div className="border-t border-dashed border-neutral-200 px-5 py-3 text-center">
            <p
              className={cn(
                "font-mono text-lg font-medium tracking-tight break-all",
                !ready && "text-neutral-400"
              )}
            >
              {trigger}
            </p>
            {/* A partner's code opens a mode from another org than the
                  WhatsApp number's; say whose, on paper as well (#345). */}
            {partnerOrg && (
              <p
                className="mt-0.5 truncate text-xs text-neutral-500"
                title={partnerOrg}
              >
                A mode from {partnerOrg}
              </p>
            )}
          </div>
        )}
      </div>

      {retry && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            disabled={retry.busy}
            onClick={() => runRetry(retry.target)}
          >
            {retry.busy ? "Checking…" : "Try again"}
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
        </div>
      )}

      {answerUncertain(state) && (
        <p className="text-muted-foreground text-xs">
          Some orgs couldn&rsquo;t be checked just now, so this may change. Try
          again to re-check.
        </p>
      )}

      {showRefreshFailed && (
        <p className="text-muted-foreground text-xs">
          Couldn&rsquo;t re-check just now. This is BT Servant&rsquo;s last
          answer.
        </p>
      )}

      {emptyHomeOrg && (
        <p className="text-muted-foreground text-xs">
          WhatsApp&rsquo;s org ({emptyHomeOrg}) has no modes yet — check
          WHATSAPP_ORG if that&rsquo;s unexpected.
        </p>
      )}

      {numberMissing && (
        <p className="text-muted-foreground text-xs">
          Also: the WhatsApp number isn't configured for this environment yet,
          so no code can be made until it is.
        </p>
      )}

      {downloadError && (
        <p className="text-destructive text-xs" role="alert">
          {downloadError}
        </p>
      )}

      {state.kind === "ready" && (
        // Stack the actions instead of a single justify-between row: at
        // `sm:max-w-md` the three buttons together are wider than the
        // dialog's content box and spilled past its right edge (#311).
        // A full-width primary over an equal-width download pair follows
        // the dialog's own vertical rhythm; the pair wraps rather than
        // spilling, so it holds at every realistic viewport width.
        <DialogFooter className="flex-col sm:flex-col sm:justify-normal">
          <Button size="sm" variant="ghost" asChild>
            <a href={state.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Open in WhatsApp
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
          {/* flex-wrap so the pair stacks rather than overflowing on very
                narrow (sub-~334px) viewports, where two whitespace-nowrap
                buttons no longer fit side by side (#311 review). */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadSvg}
              className="flex-1"
            >
              <Download />
              Download SVG
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadPng}
              className="flex-1"
            >
              <Download />
              Download PNG
            </Button>
          </div>
        </DialogFooter>
      )}
    </>
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

function describe(state: ModeSharePanelState, modeName: string): string {
  switch (state.kind) {
    case "loading-config":
      return "Checking the WhatsApp settings…";
    case "checking-code":
      return "Checking this mode's WhatsApp code…";
    case "error":
      return "Couldn't load the WhatsApp settings.";
    case "retry":
      return describeTransient(state.cause);
    case "failed":
      return describeFailure(state.failure);
    case "code-unencodable":
      return "BT Servant's code for this mode can't be put in a WhatsApp link. Ask unfoldingWord to check the mode.";
    case "not-found":
      return "BT Servant couldn't find this mode. Reload the page and try again.";
    case "unconfigured":
      return "WhatsApp number not configured. Set WHATSAPP_NUMBER for this environment to generate share codes.";
    case "number-invalid":
      return "The configured WhatsApp number isn't a valid E.164 number. Check WHATSAPP_NUMBER for this environment.";
    case "org-unconfigured":
      return "WhatsApp's org isn't set up correctly for this environment. Check WHATSAPP_ORG to generate share codes.";
    case "worker-sees":
      return state.sees === "draft"
        ? "BT Servant currently sees this mode as unpublished. If you just published it, try again in a moment. If not, reload the page to see its latest settings."
        : "BT Servant currently sees this mode as group chat only. If you just turned that off, try again in a moment. If not, reload the page to see its latest settings.";
    case "invalid-mode":
      return "This mode's saved settings are damaged, so BT Servant on WhatsApp can't open it. Ask unfoldingWord to check the mode.";
    case "upgrade-needed":
      return "Share codes need a newer BT Servant version.";
    case "slug-invalid":
      return "This mode's name can't be encoded as a trigger. Rename it to lowercase letters, digits, and hyphens to share it by QR.";
    case "slug-reserved":
      return `“${modeName}” is a reserved word — on WhatsApp, #${modeName} takes a user out of their mode, so modes with this name aren't shared by QR. Rename the mode to share it.`;
    case "org-unencodable":
      return "This mode can't get a WhatsApp code: its org name needs at least one letter or digit.";
    case "org-skipped":
      return `BT Servant on WhatsApp doesn't read this org's modes, so ${state.trigger} wouldn't open this one.`;
    case "collision":
      if (state.sameOrg) {
        return `${state.trigger} already opens another mode in this org, not this one. Rename the mode to share it by QR.`;
      }
      return state.resolvedOrg
        ? `${state.trigger} opens ${state.resolvedOrg}'s mode, not this one. Rename the mode or ask unfoldingWord to rename an org.`
        : `${state.trigger} opens another org's mode, not this one. Rename the mode or ask unfoldingWord to rename an org.`;
    case "ambiguous":
      return state.resolvedOrg
        ? `${state.trigger} opens a different mode from ${state.resolvedOrg}, not this one. Rename the mode to share it by QR.`
        : `${state.trigger} opens a different mode, not this one. Rename the mode to share it by QR.`;
    case "capped":
      return "WhatsApp can't reach this org's modes yet. For now BT Servant reads a limited number of orgs, and this one isn't included. unfoldingWord can tell you more.";
    case "unresolved":
      return `BT Servant on WhatsApp doesn't open this mode with ${state.trigger}. Ask unfoldingWord to check the mode.`;
    case "group-only":
      return "Group chat only. This mode is hidden from WhatsApp direct messages. Turn off “Requires group chat” to get a WhatsApp code.";
    case "draft":
      return "This mode isn't published yet. Publish it to get a WhatsApp code.";
    case "ready":
      return state.partnerOrg
        ? `Scan with a phone camera to open WhatsApp with ${state.trigger} ready to send. The code starts with the org name because this mode is from ${state.partnerOrg}. Print the card, or share the link.`
        : `Scan with a phone camera to open WhatsApp with ${state.trigger} ready to send. Print the card, or share the link.`;
  }
}

function placeholderLabel(state: ModeSharePanelState): string {
  switch (state.kind) {
    case "loading-config":
    case "checking-code":
      return "Loading";
    case "error":
    case "retry":
      return "Unavailable";
    case "not-found":
      return "Mode not found";
    case "unconfigured":
      return "Number not configured";
    case "number-invalid":
      return "Number invalid";
    case "org-unconfigured":
      return "Org not configured";
    case "worker-sees":
      return "Not shareable yet";
    case "invalid-mode":
      return "Mode needs repair";
    case "failed":
      return "Unavailable";
    case "code-unencodable":
      return "Can't encode this code";
    case "upgrade-needed":
      return "Needs a newer version";
    case "slug-invalid":
    case "slug-reserved":
      return "Can't encode this name";
    case "org-unencodable":
      return "Can't encode this org";
    case "org-skipped":
    case "unresolved":
      return "Not reachable";
    case "collision":
    case "ambiguous":
      return "Opens another mode";
    case "capped":
      return "Not reachable yet";
    case "group-only":
      return "Group chat only";
    case "draft":
      return "Publish to activate";
    case "ready":
      return "";
  }
}

function describeFailure(failure: ShareCodeFailure): string {
  switch (failure) {
    case "invalid-name":
      return "BT Servant doesn't accept this mode's name. Rename it to lowercase letters, digits, and hyphens to share it by QR.";
    case "org-invalid":
      return "This org's name isn't valid for BT Servant. Ask unfoldingWord to check it.";
    case "bad-request":
      return "BT Servant couldn't read this request. Reload the page and try again.";
    case "corrupt-record":
      return "This org's modes record is damaged, so the code can't be checked. Ask unfoldingWord to repair it.";
    case "engine-auth":
      return "The portal can't authenticate to BT Servant, so this is a configuration problem; tell an unfoldingWord admin.";
  }
}

function describeTransient(cause: ShareCodeTransient): string {
  switch (cause) {
    case "unavailable":
      return "BT Servant couldn't check this mode's code just now. Try again in a moment.";
    case "server":
      return "BT Servant had a problem checking this mode's code. Try again.";
    case "network":
      return "Couldn't reach BT Servant to check this mode's code. Check your connection and try again.";
    case "signed-out":
      return "Your session may have ended. Sign in again to get this mode's code, or try again.";
    case "forbidden":
      return "You don't have access to this org's modes, so its WhatsApp code can't be checked. If that's unexpected, try again.";
  }
}
