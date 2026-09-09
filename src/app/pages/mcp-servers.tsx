import { useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { McpServer } from "@/types/mcp-servers";
import {
  McpPoolNotMigratedError,
  McpServersForbiddenError,
  McpServersRequestError,
} from "@/lib/mcp-servers-api";
import { useAuthStore } from "@/lib/auth-store";
import { useDeleteMcpServer, useMcpServers } from "@/hooks/use-mcp-servers";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { McpServerDialog } from "@/components/mcp-server-dialog";
import { PageHeader } from "@/components/page-header";

// Only super-admins delete: a partner's server may be referenced by another
// org's modes and nothing tracks those references today, so deletions go
// through uW (#292). Editing is owner-scoped instead.
export function McpServersPage() {
  const userOrg = useAuthStore((s) => s.user?.org ?? "");
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);

  const poolQuery = useMcpServers();
  const deleteServer = useDeleteMcpServer();

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Memoized so the derived useMemos below keep a stable identity across
  // renders (a fresh `?? []` each render would otherwise re-run them).
  const servers = useMemo(
    () => poolQuery.data?.servers ?? [],
    [poolQuery.data]
  );
  // Writes require a successful read AND a migrated pool. Until the pool has
  // actually loaded, `canWrite` stays false so Add/Edit/Delete aren't offered
  // against an unknown (possibly unmigrated) pool. `loaded` gates the
  // not-migrated banner so it doesn't flash during the initial fetch.
  const loaded = poolQuery.data !== undefined;
  const canWrite = poolQuery.data?.migrated === true;
  const existingIds = useMemo(() => servers.map((s) => s.id), [servers]);

  const editingServer = useMemo(
    () => servers.find((s) => s.id === editingId) ?? null,
    [servers, editingId]
  );
  const confirmDeleteServer = useMemo(
    () => servers.find((s) => s.id === confirmDeleteId) ?? null,
    [servers, confirmDeleteId]
  );

  // Editing is owner-scoped; an absent ownerOrg (older worker or legacy entry)
  // is treated as un-attributed → super-admin only. The BFF enforces the same
  // rule server-side; these gates just prevent the obvious footgun up front.
  const canEdit = (server: McpServer): boolean =>
    isSuperAdmin ||
    (server.ownerOrg !== undefined && server.ownerOrg === userOrg);

  const handleConfirmDelete = () => {
    if (!confirmDeleteServer) return;
    setDeleteError(null);
    deleteServer.mutate(confirmDeleteServer.id, {
      onSuccess: () => setConfirmDeleteId(null),
      onError: (err) => {
        if (err instanceof McpPoolNotMigratedError) {
          setDeleteError(err.message);
        } else if (err instanceof McpServersForbiddenError) {
          setDeleteError(err.serverMessage ?? "You don't have permission.");
        } else if (err instanceof McpServersRequestError) {
          setDeleteError(err.serverMessage ?? `Failed (${err.status}).`);
        } else {
          setDeleteError(err instanceof Error ? err.message : "Failed.");
        }
      },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="MCP Servers"
        subtitle="The shared library of MCP servers BT Servant can draw on. Add and manage your org's servers here; the whole pool is visible to every org."
        variant="resources"
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!canWrite}
            title={
              canWrite
                ? undefined
                : "The server pool isn't set up in this environment yet."
            }
          >
            <Plus className="mr-1.5 size-3.5" />
            Add server
          </Button>
        </div>
      </div>

      {loaded && !canWrite && (
        <div className="bg-muted/40 text-muted-foreground border-b px-6 py-3 text-sm">
          The server pool hasn&rsquo;t been set up in this environment yet.
          You&rsquo;re seeing the current list, but adding, editing, and
          removing servers is disabled until it&rsquo;s migrated.
        </div>
      )}

      {poolQuery.error && (
        <div className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm">
          {poolQuery.error.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {poolQuery.isLoading ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="size-5 animate-spin"
            />
            <p className="text-sm">Loading servers…</p>
          </div>
        ) : poolQuery.error ? // The error banner above says what happened; don't also render the
        // "empty pool" state, which would wrongly imply the pool is empty.
        null : servers.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">
              No servers in the pool yet.
              {canWrite && " Click “Add server” to register the first one."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 text-xs tracking-wide uppercase">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Server</th>
                <th className="px-6 py-3 text-left font-medium">URL</th>
                <th className="px-6 py-3 text-left font-medium">Priority</th>
                <th className="px-6 py-3 text-left font-medium">Owner</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {servers.map((server) => {
                const editable = canEdit(server);
                return (
                  <tr key={server.id} className="hover:bg-muted/20">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">
                          {server.name}
                        </span>
                        {!server.enabled && (
                          <Badge variant="outline" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                        {server.hasAuthToken && (
                          <Badge variant="secondary" className="text-xs">
                            Token
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {server.id}
                      </div>
                    </td>
                    <td className="text-muted-foreground max-w-[22rem] truncate px-6 py-3 font-mono text-xs">
                      {server.url}
                    </td>
                    <td className="px-6 py-3">{server.priority}</td>
                    <td className="px-6 py-3">
                      <Badge variant="outline" className="text-xs">
                        {server.ownerOrg ?? "unfoldingWord"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(server.id)}
                          disabled={!editable || !canWrite}
                          title={
                            editable
                              ? "Edit server"
                              : "Only the owning org (or a super admin) can edit this server."
                          }
                        >
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Edit {server.name}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteId(server.id);
                          }}
                          disabled={!isSuperAdmin || !canWrite}
                          title={
                            isSuperAdmin
                              ? "Delete server"
                              : "Deletions go through unfoldingWord."
                          }
                        >
                          <Trash2 className="text-destructive size-3.5" />
                          <span className="sr-only">Delete {server.name}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <McpServerDialog
        server={null}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={existingIds}
      />

      <McpServerDialog
        server={editingServer}
        // Gate on the resolved server, not just the id: if the row is deleted
        // elsewhere while the dialog is open, editingServer becomes null and we
        // close rather than silently flipping the dialog into "Add" mode.
        open={editingId !== null && editingServer !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        existingIds={existingIds}
      />

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete server?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteServer ? (
                <>
                  This permanently removes{" "}
                  <span className="text-foreground font-medium">
                    {confirmDeleteServer.name}
                  </span>{" "}
                  ({confirmDeleteServer.id}) from the shared pool. Any org whose
                  modes reference it will stop reaching it. This can&rsquo;t be
                  undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteServer.isPending}>
              Cancel
            </AlertDialogCancel>
            {/*
              Plain Button (not AlertDialogAction): Radix's Action closes the
              dialog on click, dismissing the inline error before the mutation's
              onError can render it. Close manually in onSuccess.
            */}
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteServer.isPending}
            >
              {deleteServer.isPending ? "Deleting…" : "Delete server"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
