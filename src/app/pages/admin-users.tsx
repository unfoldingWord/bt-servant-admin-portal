import { useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Plus, Trash2, UserPen } from "lucide-react";

import type { AdminUser } from "@/types/admin-users";
import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
  ORG_FILTER_ALL_SENTINEL,
} from "@/lib/admin-users-api";
import type { LanguageRights } from "@/types/auth";
import { useAuthStore } from "@/lib/auth-store";
import { useAdminUsers, useDeleteAdminUser } from "@/hooks/use-admin-users";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminUserCreateDialog } from "@/components/admin-user-create-dialog";
import { AdminUserEditDialog } from "@/components/admin-user-edit-dialog";
import { PageHeader } from "@/components/page-header";

export function AdminUsersPage() {
  const callerEmail = useAuthStore((s) => s.user?.email ?? "");
  const callerOrg = useAuthStore((s) => s.user?.org ?? "");
  const callerIsSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);

  const usersQuery = useAdminUsers();
  const deleteUser = useDeleteAdminUser();

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(
    null
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>(ORG_FILTER_ALL_SENTINEL);

  const editingUser = useMemo(
    () => usersQuery.data?.find((u) => u.email === editingEmail) ?? null,
    [usersQuery.data, editingEmail]
  );
  const confirmDeleteUser = useMemo(
    () => usersQuery.data?.find((u) => u.email === confirmDeleteEmail) ?? null,
    [usersQuery.data, confirmDeleteEmail]
  );

  // Distinct orgs from the returned user list. Org admins receive an
  // org-filtered list (trivially length 1) but we hide the filter for
  // them anyway; for super admins this enumerates every org with at
  // least one user.
  const distinctOrgs = useMemo(() => {
    if (!usersQuery.data) return [];
    return Array.from(new Set(usersQuery.data.map((u) => u.org))).sort();
  }, [usersQuery.data]);

  const visibleUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    if (!callerIsSuperAdmin || orgFilter === ORG_FILTER_ALL_SENTINEL) {
      return usersQuery.data;
    }
    return usersQuery.data.filter((u) => u.org === orgFilter);
  }, [usersQuery.data, callerIsSuperAdmin, orgFilter]);

  const handleConfirmDelete = () => {
    if (!confirmDeleteUser) return;
    setDeleteError(null);
    deleteUser.mutate(confirmDeleteUser.email, {
      onSuccess: () => {
        setConfirmDeleteEmail(null);
      },
      onError: (err) => {
        if (err instanceof AdminUsersForbiddenError) {
          setDeleteError(err.serverMessage ?? "You don't have permission.");
        } else if (err instanceof AdminUsersRequestError) {
          setDeleteError(err.serverMessage ?? `Failed (${err.status}).`);
        } else {
          setDeleteError(err.message);
        }
      },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Users"
        subtitle={
          callerIsSuperAdmin
            ? "Manage users across all organizations. Assign org admin, super admin, and language-shepherd permissions here."
            : `Manage users in the ${callerOrg} organization. Assign org admin and language-shepherd permissions here.`
        }
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          {callerIsSuperAdmin && distinctOrgs.length > 0 && (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by org" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORG_FILTER_ALL_SENTINEL}>
                  All organizations
                </SelectItem>
                {distinctOrgs.map((org) => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            New user
          </Button>
        </div>
      </div>

      {usersQuery.error && (
        <div className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm">
          {usersQuery.error.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {usersQuery.isLoading ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="size-5 animate-spin"
            />
            <p className="text-sm">Loading users…</p>
          </div>
        ) : !usersQuery.data || usersQuery.data.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">
              No users yet. Click &ldquo;New user&rdquo; to add the first one.
            </p>
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">
              No users in <span className="font-mono">{orgFilter}</span>.{" "}
              <button
                type="button"
                onClick={() => setOrgFilter(ORG_FILTER_ALL_SENTINEL)}
                className="text-foreground underline-offset-2 hover:underline"
              >
                Clear filter
              </button>
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 text-xs tracking-wide uppercase">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                {callerIsSuperAdmin && (
                  <th className="px-6 py-3 text-left font-medium">Org</th>
                )}
                <th className="px-6 py-3 text-left font-medium">Role</th>
                <th className="px-6 py-3 text-left font-medium">Access</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleUsers.map((u) => (
                <UserRow
                  key={u.email}
                  user={u}
                  isSelf={u.email === callerEmail}
                  callerIsSuperAdmin={callerIsSuperAdmin}
                  onEdit={() => setEditingEmail(u.email)}
                  onDelete={() => {
                    setDeleteError(null);
                    setConfirmDeleteEmail(u.email);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AdminUserCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        callerOrg={callerOrg}
        callerIsSuperAdmin={callerIsSuperAdmin}
      />

      <AdminUserEditDialog
        user={editingUser}
        open={editingEmail !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEmail(null);
        }}
        callerEmail={callerEmail}
        callerIsSuperAdmin={callerIsSuperAdmin}
      />

      <AlertDialog
        open={confirmDeleteEmail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteEmail(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteUser ? (
                <>
                  This will permanently remove{" "}
                  <span className="text-foreground font-medium">
                    {confirmDeleteUser.name}
                  </span>{" "}
                  ({confirmDeleteUser.email}) from {confirmDeleteUser.org}.
                  Their existing sessions stop validating on the next request.
                  This action cannot be undone.
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
            <AlertDialogCancel disabled={deleteUser.isPending}>
              Cancel
            </AlertDialogCancel>
            {/*
              Plain Button (not AlertDialogAction) — Radix's Action closes the
              dialog on click, which would dismiss the inline error before the
              async mutation's onError can render it. Closing happens manually
              in handleConfirmDelete's onSuccess.
            */}
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete user"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface UserRowProps {
  user: AdminUser;
  isSelf: boolean;
  callerIsSuperAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function UserRow({
  user,
  isSelf,
  callerIsSuperAdmin,
  onEdit,
  onDelete,
}: UserRowProps) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-6 py-3">
        <div className="font-medium">{user.name}</div>
        {isSelf && <div className="text-muted-foreground text-xs">you</div>}
      </td>
      <td className="text-muted-foreground px-6 py-3 font-mono text-xs">
        {user.email}
      </td>
      {callerIsSuperAdmin && (
        <td className="text-muted-foreground px-6 py-3 font-mono text-xs">
          {user.org}
        </td>
      )}
      <td className="px-6 py-3">
        <div className="flex flex-wrap gap-1">
          {callerIsSuperAdmin && user.isSuperAdmin && (
            // Gated on the viewer (callerIsSuperAdmin), not just the row.
            // The worker's safeUser returns isSuperAdmin to every admin
            // caller — including org admins viewing their own org-filtered
            // list — so an unsuper viewer seeing a same-org colleague who
            // happens to also hold super would leak the cross-org role.
            // A worker-side redaction is a more durable fix (track as a
            // follow-up) but the UI gate closes the leak today.
            <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-primary/30 border">
              Super
            </Badge>
          )}
          {user.isAdmin ? (
            <Badge>Admin</Badge>
          ) : (
            <Badge variant="outline">Member</Badge>
          )}
        </div>
      </td>
      <td className="px-6 py-3">
        <AccessSummary user={user} />
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <UserPen className="mr-1.5 size-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isSelf}
            title={isSelf ? "You cannot delete yourself" : "Delete user"}
            onClick={onDelete}
            className="text-destructive hover:text-destructive disabled:text-muted-foreground"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Verb-perms summary cell — shows effective access on both axes
// (language + mode) and both verbs. For each verb the badge collapses
// to one of: All / None / N items / Default (full, legacy back-compat).
// Mirrors the lazy-fallback chain the worker applies: explicit verb-
// perm → legacy `language_rights` for languages → undefined for modes.
function AccessSummary({ user }: { user: AdminUser }) {
  const langEdit = user.language_edit_rights ?? user.language_rights;
  const langPublish = user.language_publish_rights ?? user.language_rights;
  const modeEdit = user.mode_edit_rights;
  const modePublish = user.mode_publish_rights;

  return (
    <div className="space-y-1.5 text-xs">
      <AccessRow label="Lang" edit={langEdit} publish={langPublish} />
      <AccessRow label="Mode" edit={modeEdit} publish={modePublish} />
    </div>
  );
}

function AccessRow({
  label,
  edit,
  publish,
}: {
  label: string;
  edit: LanguageRights | undefined;
  publish: LanguageRights | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-10 font-medium tracking-wide uppercase">
        {label}
      </span>
      <VerbBadge verb="E" value={edit} />
      <VerbBadge verb="P" value={publish} />
    </div>
  );
}

function VerbBadge({
  verb,
  value,
}: {
  verb: "E" | "P";
  value: LanguageRights | undefined;
}) {
  if (value === undefined) {
    return (
      <span className="text-muted-foreground font-mono text-[10px]">
        {verb}:default
      </span>
    );
  }
  if (value === "*") {
    return (
      <Badge className="px-1.5 py-0 font-mono text-[10px]">{verb}:all</Badge>
    );
  }
  if (value.length === 0) {
    return (
      <Badge
        variant="outline"
        className="border-destructive text-destructive px-1.5 py-0 font-mono text-[10px]"
      >
        {verb}:none
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="px-1.5 py-0 font-mono text-[10px]"
      title={value.join(", ")}
    >
      {verb}:{value.length}
    </Badge>
  );
}
