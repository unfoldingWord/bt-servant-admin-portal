import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";

import {
  MAX_MODE_DOCUMENT_LENGTH,
  buildPriorityEntries,
  generatePriorityBlock,
  mergeOrderWithLive,
  parsePriorityDescriptions,
  parsePriorityOrder,
  splicePriorityBlock,
  type MergedEntry,
  type PriorityEntry,
} from "@/lib/resource-priority";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { useResources } from "@/hooks/use-resources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Verbatim from #277 — the one thing every reader of this panel must
// understand before they rank anything. Ranking biases retrieval; it does
// not bind it, and promising otherwise would be a lie the prompt can't keep.
const EXPECTATION_COPY =
  "Ranking strongly increases the likelihood that BT Servant answers from higher-ranked sources first. It is not a guarantee — a lower-ranked source can still be used when it fits the question better.";
const SCOPE_COPY = "Priorities apply to this mode in every language.";

// Same sentence the Modes header uses for the same denial (see
// NO_EDIT_RIGHTS_REASON in app/pages/modes.tsx). The header already gates the
// button that opens this panel; this is the backstop, and it has to read
// identically — one denial, one wording.
const NO_EDIT_RIGHTS_REASON = "You don't have edit rights on this mode.";

interface ResourcePriorityPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current draft document — the panel splices into THIS, not the cache. */
  document: string;
  canEdit: boolean;
  /**
   * Emits the next document. The panel never fetches modes and never saves;
   * the page saves and NEVER rejects this promise — a failure is recorded in
   * `applyError` instead, so it survives the sheet unmounting on close.
   */
  onApply: (nextDocument: string) => void | Promise<void>;
  /**
   * The page's record of the last failed apply-save, rendered inside the
   * sheet: the page's own error banner sits under the sheet's modal overlay,
   * where a user mid-ranking can neither read it nor act on it. Page-owned
   * state (not panel state) so that closing and reopening the sheet — which
   * unmounts this subtree — can't silently forget that the draft is unsaved.
   */
  applyError: string | null;
  /** A save is in flight somewhere on the page; Apply/Remove must wait it out. */
  isSaving?: boolean;
}

/**
 * Per-mode resource prioritization (#277).
 *
 * The ordering lives in the mode document as a generated block inside
 * `## Tool Guidance` (see `lib/resource-priority.ts` for why). This panel is a
 * thin projection of that lib: it reads the stored order out of the draft,
 * merges it with the live aggregation for one language, lets the user reorder,
 * and hands the next document back. The page owns saving and owns `open`, so a
 * failed save keeps the panel exactly where the user left it.
 */
export function ResourcePriorityPanel(props: ResourcePriorityPanelProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {/* Accent rail in the Modes brand color, mirroring the PageHeader's top
          strip — the panel edits a mode document, and it should read that way
          the moment it slides in. */}
      <SheetContent
        className="w-full gap-0 border-l-[3px] p-0 sm:max-w-xl"
        style={{ borderLeftColor: "var(--brand-modes)" }}
        // The page refuses dismissal mid-save; hide the chrome X in that
        // window so nothing on screen merely LOOKS dismissible.
        showCloseButton={!props.isSaving}
      >
        {/* Radix unmounts this subtree when closed, which is exactly what keeps
            the resources query from running on every Modes page load — and what
            re-initialises the working order from the draft on each open. */}
        <PanelBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  document,
  canEdit,
  onApply,
  onOpenChange,
  applyError,
  isSaving = false,
}: ResourcePriorityPanelProps) {
  const contextOrg = useUiStore((s) => s.contextOrg);

  // The endpoint takes an IETF-style content-language code, not the org's
  // tuning-language slugs — same free-text input as the Resources page, and
  // the same query key, so the two share one cache.
  const [languageInput, setLanguageInput] = useState("en");
  const [language, setLanguage] = useState("en");
  const resources = useResources(language, contextOrg);
  const data = resources.data;

  // What the document currently says. `null` = no block, `"corrupt"` = a block
  // whose order line is unreadable (a hand-edit, or an opening marker whose
  // closing marker was deleted); in both cases we start from an empty ranking
  // rather than rewriting anything behind the user's back.
  const parsed = useMemo(() => parsePriorityOrder(document), [document]);
  const storedOrder = useMemo(
    () => (Array.isArray(parsed) ? parsed : []),
    [parsed]
  );
  const hasBlock = parsed !== null;
  const isCorrupt = parsed === "corrupt";

  // `null` until the user touches something, so the working order tracks the
  // document (and a save that lands from elsewhere) until there is an edit to
  // protect.
  const [order, setOrder] = useState<string[] | null>(null);
  const [applying, setApplying] = useState(false);
  // Reordering is keyboard-first, and a keyboard-first control that only
  // reports itself visually isn't finished: every mutation narrates where the
  // row landed.
  const [announcement, setAnnouncement] = useState("");

  const liveEntries = useMemo<PriorityEntry[]>(
    () => (data ? buildPriorityEntries(data) : []),
    [data]
  );
  const entriesById = useMemo(
    () => new Map(liveEntries.map((entry) => [entry.id, entry])),
    [liveEntries]
  );
  // What the current block says about each ranked id — the fallback that lets
  // a row (and its regenerated prompt line) keep its description when the
  // aggregation being browsed doesn't list it: another language, a server
  // outage. Without it, reopening the panel — which resets enumeration to
  // "en" — would offer to rewrite a ranked list to raw ids, with Apply
  // enabled and no user intent behind it.
  const recoveredDescriptions = useMemo(
    () => parsePriorityDescriptions(document),
    [document]
  );
  // Two lists, one source of truth. `ranked` is the ordering itself — a sparse
  // list of the resources someone deliberately ranked, and the ONLY thing that
  // reaches the document. `unranked` is the rest of the catalog, offered as
  // candidates; leaving a resource there is how a user says "no preference".
  const merged = useMemo(
    () =>
      mergeOrderWithLive(
        order ?? storedOrder,
        liveEntries,
        recoveredDescriptions
      ),
    [order, storedOrder, liveEntries, recoveredDescriptions]
  );
  const ranked = merged.ranked;
  const unranked = merged.unranked;
  const orderedIds = useMemo(() => ranked.map((row) => row.id), [ranked]);

  const block = useMemo(
    () => generatePriorityBlock(orderedIds, entriesById, recoveredDescriptions),
    [orderedIds, entriesById, recoveredDescriptions]
  );
  const nextDocument = useMemo(
    () => splicePriorityBlock(document, block),
    [document, block]
  );

  // "Nothing to apply" is a question about the DOCUMENT, not about the id
  // sequence: comparing the spliced result catches the cases a sequence
  // comparison misses — a corrupt or orphaned block that this apply would
  // repair, a duplicated stored id that it would normalize.
  const unchanged = nextDocument === document;
  const tooLong = nextDocument.length > MAX_MODE_DOCUMENT_LENGTH;
  const busy = isSaving || applying;

  // Applying before the aggregation lands would regenerate every line from an
  // empty lookup — the ranked list would come back as raw ids badged "not
  // currently listed". The order is intent, but the prose is only as good as
  // the data behind it, so Apply waits for the data.
  //
  // `unchanged` stops blocking once an apply has failed: the page shows the
  // edit in the draft before the PUT resolves, so after a failure the document
  // this panel reads already matches the working order. Without the exception,
  // the retry path would be disabled with "already matches what's saved" —
  // which would be precisely backwards.
  const applyBlockedReason = !canEdit
    ? NO_EDIT_RIGHTS_REASON
    : busy
      ? "Another save is in flight. Try again in a moment."
      : !data
        ? "Load the resource list before applying an order."
        : tooLong
          ? "This mode document would exceed the 64,000-character limit."
          : unchanged && applyError === null
            ? "The order already matches what's saved."
            : null;

  const submitLanguage = (e: React.FormEvent) => {
    e.preventDefault();
    const next = languageInput.trim();
    if (next) setLanguage(next);
  };

  // Saving — and recording a failed save — is the page's job (`applyError`
  // comes back down as a prop). The await only scopes the local busy state;
  // the page's contract is that this promise never rejects, and the catch is
  // a belt-and-braces guard for that contract, not a reporting path.
  const submitDocument = useCallback(
    async (next: string) => {
      setApplying(true);
      try {
        await onApply(next);
      } catch {
        // The page records and renders the failure via `applyError`.
      } finally {
        setApplying(false);
      }
    },
    [onApply]
  );

  // Focus has to survive a reorder, or a keyboard user loses their place on
  // every press. React keeps focus on the moved button (rows are keyed by id)
  // except when that button becomes disabled — at the end of the list, or
  // because the row moved between the two lists — so name the fallbacks and
  // take the first one that can hold focus.
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const [pendingFocus, setPendingFocus] = useState<string[] | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    for (const key of pendingFocus) {
      const button = buttons.current.get(key);
      if (button && !button.disabled) {
        button.focus();
        break;
      }
    }
    setPendingFocus(null);
  }, [pendingFocus]);

  // Every mutation rebases on `orderedIds`, the list actually on screen —
  // never on the `order` state, which is `null` before the first edit and can
  // otherwise lag behind rows that arrived with a refetch.
  const move = useCallback(
    (index: number, dir: "up" | "down") => {
      const to = dir === "up" ? index - 1 : index + 1;
      if (to < 0 || to >= orderedIds.length) return;
      const next = [...orderedIds];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);

      setOrder(next);
      setAnnouncement(
        `${ranked[index]?.label ?? moved} moved to position ${String(to + 1)} of ${String(next.length)}.`
      );
      setPendingFocus([
        `${moved}:${dir}`,
        `${moved}:${dir === "up" ? "down" : "up"}`,
      ]);
    },
    [orderedIds, ranked]
  );

  const rank = useCallback(
    (entry: MergedEntry) => {
      if (orderedIds.includes(entry.id)) return;
      const next = [...orderedIds, entry.id];

      setOrder(next);
      setAnnouncement(
        `${entry.label} ranked at position ${String(next.length)} of ${String(next.length)}.`
      );
      setPendingFocus([`${entry.id}:unrank`, `${entry.id}:up`]);
    },
    [orderedIds]
  );

  const unrank = useCallback(
    (entry: MergedEntry) => {
      const next = orderedIds.filter((id) => id !== entry.id);

      setOrder(next);
      setAnnouncement(
        `${entry.label} removed from the ranking. ${String(next.length)} ranked.`
      );
      setPendingFocus([`${entry.id}:rank`]);
    },
    [orderedIds]
  );

  // Note what is NOT reset: `applyError`. A failed save is a fact about the
  // document, not about the working order — it is page state, and it stays on
  // screen (with Apply enabled) until the next save attempt resolves it.
  const reset = useCallback(() => {
    setOrder(null);
    setAnnouncement("Ranking reset to the saved order.");
  }, []);

  const degraded = (data?.servers ?? []).filter((s) => s.status !== "ok");

  return (
    <>
      <SheetHeader className="border-b p-4 sm:px-5">
        <SheetTitle className="text-base tracking-tight">
          Resource priorities
        </SheetTitle>
        <SheetDescription>
          Rank the sources this mode reaches for first. The ranking is written
          into the mode document, under Tool Guidance.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-5">
        {/* Rendered unconditionally so assistive tech is already watching it
            when the first move happens. */}
        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>

        <div
          className="bg-muted/40 rounded-r-md border-l-2 px-3 py-2.5"
          style={{ borderLeftColor: "var(--brand-modes)" }}
        >
          <p className="text-foreground/90 text-xs leading-relaxed">
            {EXPECTATION_COPY}
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            {SCOPE_COPY}
          </p>
        </div>

        <form className="flex items-end gap-2" onSubmit={submitLanguage}>
          <div className="space-y-1.5">
            <Label htmlFor="priority-language" className="text-xs">
              Content language
            </Label>
            <Input
              id="priority-language"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
              placeholder="en"
              className="h-8 w-28 text-sm"
              aria-describedby="priority-language-hint"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!languageInput.trim() || resources.isFetching}
          >
            Load
          </Button>
          <p
            id="priority-language-hint"
            className="text-muted-foreground pb-1.5 text-xs"
          >
            Enumerates the catalog — the ranking itself is language-independent.
          </p>
        </form>

        {isCorrupt && (
          <div
            className="border-destructive bg-destructive/10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-r-md border-l-2 px-3 py-2.5"
            role="status"
          >
            <p className="text-destructive min-w-0 flex-1 text-xs leading-relaxed">
              We couldn&rsquo;t read the saved ordering in this document — it
              looks hand-edited. Nothing has been changed. Rank what you need
              below and apply to rewrite the block, or remove the priorities
              altogether.
            </p>
            <Button
              size="xs"
              variant="outline"
              onClick={reset}
              className="shrink-0"
            >
              <RotateCcw />
              Reset
            </Button>
          </div>
        )}

        {resources.error && (
          <div
            className="bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2.5 text-xs"
            role="alert"
          >
            {resources.error.message}
          </div>
        )}

        {degraded.length > 0 && (
          <ul className="space-y-1">
            {degraded.map((server) => (
              <li
                key={server.serverId}
                className={cn(
                  "flex flex-wrap items-center gap-x-1.5 text-[11px]",
                  server.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    server.status === "error"
                      ? "bg-destructive"
                      : "bg-muted-foreground/40"
                  )}
                />
                <span className="font-medium">{server.serverName}</span>
                <span>
                  {server.status === "error"
                    ? "failed to respond, so its resources are missing from this list"
                    : "doesn't list resources, so it can't be ranked"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {resources.isLoading ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-12">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="size-4 animate-spin"
            />
            <p className="text-xs">Loading resources…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                Ranked order
              </h3>
              {order !== null && (
                <Button size="xs" variant="ghost" onClick={reset}>
                  <RotateCcw />
                  Reset
                </Button>
              )}
            </div>

            {ranked.length === 0 ? (
              <div className="bg-card rounded-xl border px-5 py-6 text-center">
                <p className="text-foreground text-sm font-medium">
                  Nothing ranked yet
                </p>
                <p className="text-muted-foreground mx-auto mt-1.5 max-w-xs text-xs leading-relaxed">
                  Rank only the sources you want this mode to reach for first.
                  Everything you leave out stays available — it just carries no
                  preference.
                </p>
              </div>
            ) : (
              <div className="relative pl-4">
                {/* Preference decays down the list, and the spine says so: full
                    brand color at rank 1, faded to nothing at the bottom. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1 bottom-1 left-[5px] w-0.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to bottom, var(--brand-modes), transparent)",
                  }}
                />
                <ol className="space-y-1">
                  {ranked.map((row, index) => (
                    <li
                      key={row.id}
                      className="bg-card hover:border-border/80 flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors"
                    >
                      <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                        {index + 1}
                      </span>
                      <RowIdentity row={row} />
                      <div className="flex shrink-0 items-center gap-0.5">
                        <div className="flex flex-col">
                          {/* The rank lives in a sibling span the button never
                              references, so it has to travel in the label too —
                              otherwise the accessible name is identical before
                              and after a move. */}
                          <Button
                            ref={(el) => {
                              buttons.current.set(`${row.id}:up`, el);
                            }}
                            size="icon-xs"
                            variant="ghost"
                            className="size-5"
                            disabled={!canEdit || index === 0}
                            aria-label={`Move ${row.label} up (currently ${String(index + 1)} of ${String(ranked.length)})`}
                            onClick={() => move(index, "up")}
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            ref={(el) => {
                              buttons.current.set(`${row.id}:down`, el);
                            }}
                            size="icon-xs"
                            variant="ghost"
                            className="size-5"
                            disabled={!canEdit || index === ranked.length - 1}
                            aria-label={`Move ${row.label} down (currently ${String(index + 1)} of ${String(ranked.length)})`}
                            onClick={() => move(index, "down")}
                          >
                            <ChevronDown />
                          </Button>
                        </div>
                        <Button
                          ref={(el) => {
                            buttons.current.set(`${row.id}:unrank`, el);
                          }}
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={!canEdit}
                          aria-label={`Remove ${row.label} from the ranking`}
                          title="Remove from the ranking"
                          onClick={() => unrank(row)}
                        >
                          <X />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <h3 className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                Not ranked
              </h3>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {unranked.length}
              </span>
            </div>

            {unranked.length === 0 ? (
              <p className="text-muted-foreground px-1 text-xs leading-relaxed">
                {data
                  ? ranked.length > 0
                    ? "Every listed resource is ranked."
                    : "The connected servers listed no resources for this language. Try another language code."
                  : "Load a language to list the resources this org can draw on."}
              </p>
            ) : (
              <ul className="space-y-1">
                {unranked.map((row) => (
                  <li
                    key={row.id}
                    className="hover:bg-card flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors"
                  >
                    <span aria-hidden className="w-5 shrink-0" />
                    <RowIdentity row={row} muted />
                    <Button
                      ref={(el) => {
                        buttons.current.set(`${row.id}:rank`, el);
                      }}
                      size="xs"
                      variant="outline"
                      className="shrink-0"
                      disabled={!canEdit}
                      aria-label={`Add ${row.label} to the ranking`}
                      onClick={() => rank(row)}
                    >
                      <Plus />
                      Rank
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <SheetFooter className="gap-3 border-t p-4 sm:px-5">
        <details className="bg-muted/30 group rounded-lg border">
          <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            Preview what goes into the document
          </summary>
          <pre className="max-h-44 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {block ||
              "Nothing to add — applying now would remove the ranking from the document."}
          </pre>
        </details>

        {tooLong && (
          <p
            className="bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2 text-xs"
            role="alert"
          >
            This ranking would push the mode document past the 64,000-character
            limit. Rank fewer resources, or trim the document.
          </p>
        )}

        {applyError && (
          <p
            className="bg-destructive/10 text-destructive border-destructive rounded-r-md border-l-2 px-3 py-2 text-xs"
            role="alert"
          >
            <span className="font-medium">Save failed.</span> {applyError}{" "}
            Nothing was saved — your ranking is still here, so you can apply
            again.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {hasBlock && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                void submitDocument(splicePriorityBlock(document, null));
              }}
              disabled={!canEdit || busy}
              title={canEdit ? undefined : NO_EDIT_RIGHTS_REASON}
            >
              Remove priorities
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              void submitDocument(nextDocument);
            }}
            disabled={applyBlockedReason !== null}
            title={applyBlockedReason ?? undefined}
            aria-describedby={
              applyBlockedReason ? "resource-priority-apply-help" : undefined
            }
          >
            {busy ? "Saving…" : "Apply"}
          </Button>
          {/* A disabled button is out of the tab order and gets no hover on
              touch, so the title alone can't carry the reason. Same idiom the
              Modes header uses for its gated switch. */}
          {applyBlockedReason && (
            <span id="resource-priority-apply-help" className="sr-only">
              {applyBlockedReason}
            </span>
          )}
        </div>
      </SheetFooter>
    </>
  );
}

/** Label, badge and attribution — identical in both lists. */
function RowIdentity({
  row,
  muted = false,
}: {
  row: MergedEntry;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "truncate text-sm font-medium",
            muted && "text-foreground/80",
            row.missing && "text-muted-foreground",
            // Mono only when nothing but the raw id is known — a missing row
            // whose description was recovered from the document reads like any
            // other row, just muted and badged.
            row.missing && row.label === row.id && "font-mono text-xs"
          )}
        >
          {row.label}
        </span>
        {row.missing && (
          <Badge
            variant="outline"
            className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
          >
            not currently listed
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground truncate text-[11px]">
        {row.missing
          ? "Kept from the saved order — no server listed it for this language"
          : [row.serverName, row.subjectLabelText].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
