import { useState } from "react";

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
  // The server being edited, or null to add a new one. The parent gives the
  // dialog a `key` tied to this target, so it remounts (and re-initialises its
  // fields) when the target changes — a background pool refetch keeps the same
  // key and therefore never clobbers in-progress edits.
  server: McpServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  existingIds,
}: McpServerDialogProps) {
  const upsert = useUpsertMcpServer();
  const isEdit = server !== null;

  // Initialised once per mount from the target. The parent keys this component
  // on the target, so switching servers (or opening Add) remounts with fresh
  // fields, while a refetch of the same target does not — no effect resync, so
  // nothing can wipe what the admin has typed. `authToken` starts empty because
  // reads are redacted; an empty field on edit means "keep the stored token".
  const [id, setId] = useState(server?.id ?? "");
  const [name, setName] = useState(server?.name ?? "");
  const [url, setUrl] = useState(server?.url ?? "");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [priority, setPriority] = useState(String(server?.priority ?? 1));
  const [authToken, setAuthToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [allowedTools, setAllowedTools] = useState(
    server?.allowedTools?.join(", ") ?? ""
  );
  const [transport, setTransport] = useState<McpTransport>(
    server?.transport ?? "json-rpc"
  );
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(server?.allowedTools?.length) || server?.transport !== undefined
  );
  const [errorText, setErrorText] = useState<string | null>(null);

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
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      setErrorText("Enter a valid http(s) URL.");
      return;
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      setErrorText("Enter a valid http(s) URL.");
      return;
    }
    const priorityText = priority.trim();
    // Plain non-negative integer only: reject "", "1.5", "-1", and exponent
    // forms like "1e3" that Number() would otherwise silently accept.
    if (!/^\d+$/.test(priorityText)) {
      setErrorText("Priority must be a whole number ≥ 0.");
      return;
    }
    const priorityNum = Number(priorityText);

    // authToken three-way (worker's #278 write rule): a typed value sets it,
    // "Remove the stored token" clears it, and leaving it blank preserves the
    // stored token. Clear is authoritative — it wins over any value left in the
    // (now-disabled) field, so checking Remove always removes.
    const typedToken = authToken.trim();
    const willHaveToken =
      !clearToken &&
      (typedToken !== "" || (server !== null && server.hasAuthToken));
    // A bearer token must never ride over cleartext: require https whenever the
    // server will carry one (newly set, or an existing one kept).
    if (willHaveToken && parsedUrl.protocol !== "https:") {
      setErrorText("Use an https URL for a server that has an auth token.");
      return;
    }

    const body: McpServerWrite = {
      id: trimmedId,
      name: trimmedName,
      url: trimmedUrl,
      enabled,
      priority: priorityNum,
      // Cleared → undefined → omitted from the JSON. The worker full-replaces
      // every field except authToken/ownerOrg, so omitting allowedTools removes
      // the restriction (it is not preserve-on-omit the way authToken is).
      allowedTools: parseAllowedTools(allowedTools),
      transport,
    };

    if (clearToken) {
      body.authToken = null;
    } else if (typedToken) {
      body.authToken = typedToken;
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
                  · owned by {server.ownerOrg ?? "—"}
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
