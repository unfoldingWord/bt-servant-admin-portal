import { useCallback, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChevronDown, ChevronRight, Pin, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDeleteUserMemory, useUserMemory } from "@/hooks/use-user-memory";
import type { MemoryEntry, MemoryResponse } from "@/types/memory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Format bytes as human-readable string (e.g. "12.5 KB") */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** Format epoch timestamp to a readable date */
function formatTimestamp(epoch: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epoch));
}

// ---------------------------------------------------------------------------
// UserIdInput — input field with UUID validation and Load button
// ---------------------------------------------------------------------------

interface UserIdInputProps {
  onLoad: (userId: string) => void;
}

function UserIdInput({ onLoad }: UserIdInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleLoad = useCallback(() => {
    const trimmed = input.trim();
    if (!UUID_V4_RE.test(trimmed)) {
      setError("Please enter a valid UUID v4");
      return;
    }
    setError("");
    onLoad(trimmed);
  }, [input, onLoad]);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          placeholder="Enter user ID (UUID v4)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          className="font-mono text-sm"
        />
        <Button size="sm" onClick={handleLoad}>
          <Search className="mr-1 size-3" />
          Load
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemorySectionCard — collapsible section showing one memory entry
// ---------------------------------------------------------------------------

interface MemorySectionCardProps {
  name: string;
  entry: MemoryEntry;
}

function MemorySectionCard({ name, entry }: MemorySectionCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <MemorySectionHeader
        name={name}
        entry={entry}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="border-t px-4 py-3">
          <pre className="bg-background max-h-64 overflow-y-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap dark:bg-white/[0.06]">
            {entry.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemorySectionHeader — clickable header row for a section
// ---------------------------------------------------------------------------

interface MemorySectionHeaderProps {
  name: string;
  entry: MemoryEntry;
  open: boolean;
  onToggle: () => void;
}

function MemorySectionHeader({
  name,
  entry,
  open,
  onToggle,
}: MemorySectionHeaderProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-4 py-3 text-left"
      onClick={onToggle}
    >
      {open ? (
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      ) : (
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {entry.pinned && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Pin className="size-2.5" />
              Pinned
            </Badge>
          )}
        </div>
        <MemoryTimestamps entry={entry} />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {formatBytes(new TextEncoder().encode(entry.content).byteLength)}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// MemoryTimestamps — created/updated line
// ---------------------------------------------------------------------------

function MemoryTimestamps({ entry }: { entry: MemoryEntry }) {
  return (
    <p className="text-muted-foreground mt-0.5 text-[11px]">
      Created {formatTimestamp(entry.createdAt)}
      {entry.updatedAt !== entry.createdAt &&
        ` · Updated ${formatTimestamp(entry.updatedAt)}`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// ClearMemoryButton — destructive button with confirmation dialog
// ---------------------------------------------------------------------------

interface ClearMemoryButtonProps {
  userId: string;
}

function ClearMemoryButton({ userId }: ClearMemoryButtonProps) {
  const deleteMutation = useDeleteUserMemory();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-1 size-3" />
          Clear Memory
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear all memory?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all memory entries for this user. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => deleteMutation.mutate(userId)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Clearing..." : "Clear Memory"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// MemorySectionList — overview + list of entries + clear button
// ---------------------------------------------------------------------------

interface MemorySectionListProps {
  data: MemoryResponse;
  userId: string;
}

function MemorySectionList({ data, userId }: MemorySectionListProps) {
  const entries = Object.entries(data.entries);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
      <MemoryOverviewBar data={data} entryCount={entries.length} />
      {entries.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm italic">
          No memory entries found.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, entry]) => (
            <MemorySectionCard key={name} name={name} entry={entry} />
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <div className="flex justify-end pt-2">
          <ClearMemoryButton userId={userId} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryOverviewBar — size + section count summary
// ---------------------------------------------------------------------------

function MemoryOverviewBar({
  data,
  entryCount,
}: {
  data: MemoryResponse;
  entryCount: number;
}) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg px-4 py-2.5">
      <span className="text-muted-foreground text-xs">
        {entryCount} {entryCount === 1 ? "section" : "sections"}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatBytes(data.toc.totalSizeBytes)} /{" "}
        {formatBytes(data.toc.maxSizeBytes)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryContent — loading/error/data states
// ---------------------------------------------------------------------------

interface MemoryContentProps {
  userId: string;
}

function MemoryContent({ userId }: MemoryContentProps) {
  const { data, isLoading, error } = useUserMemory(userId);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
        <FontAwesomeIcon
          icon={faSpinnerThird}
          className="size-5 animate-spin"
        />
        <p className="text-sm">Loading memory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 pb-6">
        <div className="bg-destructive/10 text-destructive border-destructive rounded-lg border-l-2 px-4 py-3 text-sm">
          {error.message}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return <MemorySectionList data={data} userId={userId} />;
}

// ---------------------------------------------------------------------------
// UserMemoryDialog — main export
// ---------------------------------------------------------------------------

interface UserMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserMemoryDialog({
  open,
  onOpenChange,
}: UserMemoryDialogProps) {
  const [userId, setUserId] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) setUserId(null);
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("flex h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 p-0")}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>User Memory</DialogTitle>
          <DialogDescription>
            View and manage memory entries for a specific user.
          </DialogDescription>
          <div className="pt-2">
            <UserIdInput onLoad={setUserId} />
          </div>
        </DialogHeader>
        {userId ? <MemoryContent userId={userId} /> : <EmptyState />}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — shown when no user ID has been entered
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 pb-6">
      <p className="text-sm">Enter a user ID above to view their memory.</p>
    </div>
  );
}
