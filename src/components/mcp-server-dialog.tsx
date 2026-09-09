import { useEffect, useState } from "react";

import type {
  McpServer,
  McpServerWrite,
  McpTransport,
} from "@/types/mcp-servers";
import {
  McpPoolNotMigratedError,
  McpServersForbiddenError,
  McpServersRequestError,
} from "@/lib/mcp-servers-api";
import { useUpsertMcpServer } from "@/hooks/use-mcp-servers";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface McpServerDialogProps {
  // The server being edited, or null to add a new one.
  server: McpServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Org context to write into (a super-admin's selected org, else undefined =
  // the caller's own org). New servers are stamped owned by this org.
  org?: string;
  // Ids already in the pool — an add dialog rejects a duplicate before the
  // request so the user gets an inline reason, not a round-trip.
  existingIds: string[];
}

// A slug the worker will accept as an id/url segment. The worker validates
// too; this is the front-line reason string.
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function parseAllowedTools(input: string): string[] | undefined {
  const tools = input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tools.length > 0 ? tools : undefined;
}

export function McpServerDialog({
  server,
  open,
  onOpenChange,
  org,
  existingIds,
}: McpServerDialogProps) {
  const upsert = useUpsertMcpServer(org);
  const isEdit = server !== null;

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState("1");
  const [authToken, setAuthToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [allowedTools, setAllowedTools] = useState("");
  const [transport, setTransport] = useState<McpTransport>("json-rpc");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Re-sync from the server prop whenever the target changes or the dialog
  // reopens. `authToken` is never echoed back (redacted), so it always starts
  // empty — an empty field on edit means "keep the stored token".
  useEffect(() => {
    if (!open) return;
    setId(server?.id ?? "");
    setName(server?.name ?? "");
    setUrl(server?.url ?? "");
    setEnabled(server?.enabled ?? true);
    setPriority(String(server?.priority ?? 1));
    setAuthToken("");
    setClearToken(false);
    setAllowedTools(server?.allowedTools?.join(", ") ?? "");
    setTransport(server?.transport ?? "json-rpc");
    setShowAdvanced(
      Boolean(server?.allowedTools?.length) || server?.transport !== undefined
    );
    setErrorText(null);
    upsert.reset();
    // upsert is a stable React Query reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const trimmedId = id.trim();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (!isEdit && !ID_RE.test(trimmedId)) {
      setErrorText(
        "Id must be lowercase letters, digits and hyphens (e.g. translation-helps)."
      );
      return;
    }
    if (!isEdit && existingIds.includes(trimmedId)) {
      setErrorText(`A server with id "${trimmedId}" already exists.`);
      return;
    }
    if (!trimmedName) {
      setErrorText("Name cannot be empty.");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("bad protocol");
      }
    } catch {
      setErrorText("Enter a valid http(s) URL.");
      return;
    }
    const priorityNum = Number(priority);
    if (!Number.isInteger(priorityNum) || priorityNum < 0) {
      setErrorText("Priority must be a whole number ≥ 0.");
      return;
    }

    const body: McpServerWrite = {
      id: trimmedId,
      name: trimmedName,
      url: trimmedUrl,
      enabled,
      priority: priorityNum,
      allowedTools: parseAllowedTools(allowedTools),
      transport,
    };

    // authToken three-way (worker's #278 write rule): a typed value sets it,
    // the explicit "remove" clears it, and leaving it blank preserves the
    // stored token. Setting and clearing at once makes no sense — the typed
    // value wins and we don't send the clear.
    const typedToken = authToken.trim();
    if (typedToken) {
      body.authToken = typedToken;
    } else if (clearToken) {
      body.authToken = null;
    }

    upsert.mutate(body, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => {
        if (err instanceof McpPoolNotMigratedError) {
          setErrorText(
            "The server pool isn't set up in this environment yet, so changes can't be saved. Reads still work."
          );
        } else if (err instanceof McpServersForbiddenError) {
          setErrorText(err.serverMessage ?? "You don't have permission.");
        } else if (err instanceof McpServersRequestError) {
          setErrorText(err.serverMessage ?? `Request failed (${err.status}).`);
        } else {
          setErrorText(err instanceof Error ? err.message : "Request failed.");
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit server" : "Add server"}</DialogTitle>
            <DialogDescription>
              {isEdit ? (
                <>
                  <span className="text-foreground font-medium">
                    {server.id}
                  </span>{" "}
                  · owned by {server.ownerOrg ?? "unfoldingWord"}
                </>
              ) : (
                "Register an MCP server in the shared pool. It becomes available to every org."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mcp-id">Id</Label>
              <Input
                id="mcp-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="translation-helps"
                // The id is the pool key; changing it would orphan the entry,
                // so it's fixed once created (edit the name instead).
                disabled={isEdit}
                required
              />
              {!isEdit && (
                <p className="text-muted-foreground text-xs">
                  A stable identifier. Can&rsquo;t be changed later.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Translation Helps"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://tc-helps.mcp.servant.bible/api/mcp"
                required
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="mcp-priority">Priority</Label>
                <Input
                  id="mcp-priority"
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Lower is tried first.
                </p>
              </div>
              <label className="hover:bg-accent flex flex-1 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-muted-foreground text-xs">
                    BT Servant may call this server.
                  </div>
                </div>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-token">Auth token</Label>
              <Input
                id="mcp-token"
                type="password"
                autoComplete="new-password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={
                  isEdit && server.hasAuthToken
                    ? "Leave blank to keep current token"
                    : "Optional bearer token"
                }
                disabled={clearToken}
              />
              {isEdit && server.hasAuthToken && (
                <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={clearToken}
                    onChange={(e) => setClearToken(e.target.checked)}
                  />
                  Remove the stored token
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              {showAdvanced ? "▾ Advanced" : "▸ Advanced"}
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-l-2 pl-4">
                <div className="space-y-2">
                  <Label htmlFor="mcp-tools">Allowed tools</Label>
                  <Input
                    id="mcp-tools"
                    value={allowedTools}
                    onChange={(e) => setAllowedTools(e.target.value)}
                    placeholder="fetch_scripture, fetch_notes"
                  />
                  <p className="text-muted-foreground text-xs">
                    Comma-separated. Leave blank to allow every tool the server
                    exposes.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-transport">Transport</Label>
                  <Select
                    value={transport}
                    onValueChange={(v) => setTransport(v as McpTransport)}
                  >
                    <SelectTrigger id="mcp-transport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json-rpc">
                        JSON-RPC (default)
                      </SelectItem>
                      <SelectItem value="streamable-http">
                        Streamable HTTP
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Use Streamable HTTP only for servers that require a session.
                  </p>
                </div>
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
              disabled={upsert.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
