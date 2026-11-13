import { useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Ban, Plus, RefreshCw } from "lucide-react";

import type { ApiKey } from "@/types/api-keys";
import {
  formatDate,
  formatDateTime,
  keyState,
  lastUsedLabel,
  sortKeys,
} from "@/lib/api-key-display";
import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { useApiKeys, useRevokeApiKey } from "@/hooks/use-api-keys";
import { ApiKeyCreateDialog } from "@/components/api-key-create-dialog";
import { ApiKeyRotateDialog } from "@/components/api-key-rotate-dialog";
import { OrgContextSelector } from "@/components/org-context-selector";
import { PageHeader } from "@/components/page-header";
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
import { Switch } from "@/components/ui/switch";

const TONE_CLASSES = {
  active:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  grace:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  inactive: "text-muted-foreground",
} as const;

// Partner API keys (#354). Org admins manage their own org's keys; super
// admins can switch org (the shared org context) or list every org. The BFF
// enforces all of it (worker/api-keys.ts); these gates only shape the UI.
export function ApiKeysPage() {
  const homeOrg = useAuthStore((s) => s.user?.org ?? "");
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);
  const contextOrg = useUiStore((s) => s.contextOrg);
  // Only a super admin may target another org; anyone else gets their own.
  const targetOrg = isSuperAdmin ? contextOrg : null;
  const targetLabel = targetOrg ?? homeOrg;

  const [allOrgs, setAllOrgs] = useState(false);
  const showAll = isSuperAdmin && allOrgs;
  const keysQuery = useApiKeys(targetOrg, showAll);
  const revoke = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [rotating, setRotating] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const keys = useMemo(
    () => sortKeys(keysQuery.data?.keys ?? []),
    [keysQuery.data]
  );
  const terms = keysQuery.data?.terms;
  const termsAccepted = terms?.acceptance != null;

  const handleRevoke = () => {
    if (!revoking) return;
    setRevokeError(null);
    revoke.mutate(revoking.id, {
      onSuccess: () => setRevoking(null),
      onError: (err) =>
        setRevokeError(err.message || "Couldn't revoke the key."),
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="API Keys"
        subtitle="Keys let your apps call BT Servant's chat API. Each key belongs to one app and one org, and can be revoked at any time. Usage is reported in the telemetry dashboard."
        variant="resources"
      />

      <div className="bg-card border-b">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
          {isSuperAdmin && (
            <>
              <OrgContextSelector />
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                <Switch checked={allOrgs} onCheckedChange={setAllOrgs} />
                Show every org&rsquo;s keys
              </label>
            </>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={!keysQuery.data}
          >
            <Plus className="mr-1.5 size-3.5" />
            Create key
            {isSuperAdmin && (
              <span className="text-primary-foreground/70 ml-1">
                for {targetLabel}
              </span>
            )}
          </Button>
        </div>
        {terms && (
          <p className="text-muted-foreground border-t px-4 py-2.5 text-xs sm:px-6">
            <span className="text-foreground font-medium">Terms of use:</span>{" "}
            &ldquo;{terms.text}&rdquo;{" "}
            {terms.acceptance ? (
              <>
                Accepted for {terms.org} by {terms.acceptance.acceptedBy} on{" "}
                {formatDate(terms.acceptance.acceptedAt)}.
              </>
            ) : (
              <>
                Not yet accepted for {terms.org}. You&rsquo;ll be asked to
                accept them when you create the first key.
              </>
            )}
          </p>
        )}
      </div>

      {keysQuery.error && (
        <div className="bg-destructive/10 text-destructive border-destructive border-l-2 px-6 py-3 text-sm">
          {keysQuery.error.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {keysQuery.isLoading ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <FontAwesomeIcon
              icon={faSpinnerThird}
              className="size-5 animate-spin"
            />
            <p className="text-sm">Loading keys…</p>
          </div>
        ) : keysQuery.error && !keysQuery.data ? null : keys.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">
              {showAll
                ? "No org has an API key yet."
                : `${targetLabel} has no API keys yet. Create one for each app that will call BT Servant.`}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 text-xs tracking-wide uppercase">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Key</th>
                {showAll && (
                  <th className="px-6 py-3 text-left font-medium">Org</th>
                )}
                <th className="px-6 py-3 text-left font-medium">Created</th>
                <th className="px-6 py-3 text-left font-medium">Last used</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((key) => {
                const state = keyState(key);
                const usable = key.status === "active";
                const canRotate = usable && key.rotatedTo === undefined;
                return (
                  <tr
                    key={key.id}
                    className={cn(
                      "hover:bg-muted/20",
                      !usable && "text-muted-foreground"
                    )}
                  >
                    <td className="px-6 py-3">
                      <div className="text-foreground font-medium">
                        {key.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {key.app}{" "}
                        <span className="font-mono">· {key.prefix}…</span>
                      </div>
                    </td>
                    {showAll && (
                      <td className="px-6 py-3">
                        <Badge variant="outline" className="text-xs">
                          {key.org}
                        </Badge>
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <div>{formatDate(key.createdAt) ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">
                        {key.createdBy}
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3",
                        !key.lastUsedAt && "text-muted-foreground text-xs"
                      )}
                    >
                      {lastUsedLabel(key)}
                    </td>
                    <td className="px-6 py-3">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", TONE_CLASSES[state.tone])}
                        title={
                          key.revokedAt
                            ? `Revoked ${formatDateTime(key.revokedAt) ?? ""}${key.revokedBy ? ` by ${key.revokedBy}` : ""}`
                            : key.expiresAt
                              ? `Replaced by a rotated key; stops working ${formatDateTime(key.expiresAt) ?? ""}`
                              : undefined
                        }
                      >
                        {state.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRotating(key)}
                          disabled={!canRotate}
                          title={
                            canRotate
                              ? "Rotate: replace with a new key"
                              : usable
                                ? "Already rotated; rotate its replacement instead."
                                : "Only an active key can be rotated."
                          }
                        >
                          <RefreshCw className="size-3.5" />
                          <span className="sr-only">Rotate {key.name}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRevokeError(null);
                            setRevoking(key);
                          }}
                          disabled={!usable}
                          title={usable ? "Revoke key" : "Already inactive."}
                        >
                          <Ban className="text-destructive size-3.5" />
                          <span className="sr-only">Revoke {key.name}</span>
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

      {createOpen && terms && (
        <ApiKeyCreateDialog
          open
          onOpenChange={setCreateOpen}
          org={targetOrg}
          orgLabel={targetLabel}
          termsAccepted={termsAccepted}
          termsText={terms.text}
        />
      )}

      {rotating && (
        <ApiKeyRotateDialog
          key={rotating.id}
          apiKey={rotating}
          onClose={() => setRotating(null)}
        />
      )}

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) {
            setRevoking(null);
            setRevokeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking && (
                <>
                  <span className="text-foreground font-medium">
                    {revoking.name}
                  </span>{" "}
                  ({revoking.app}) stops working within about a minute. Any app
                  still using it will get errors. This can&rsquo;t be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError && (
            <p className="bg-destructive/10 text-destructive border-destructive border-l-2 px-3 py-2 text-sm">
              {revokeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>
              Cancel
            </AlertDialogCancel>
            {/* Plain Button: AlertDialogAction would close before onError. */}
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
