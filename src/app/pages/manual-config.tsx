import { useCallback, useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import {
  useOrgOverrides,
  useUpdateOrgOverrides,
} from "@/hooks/use-prompt-config";
import type { PromptSlot } from "@/types/prompt-override";
import { PROMPT_SLOTS } from "@/types/prompt-override";
import { PromptPanel } from "@/components/prompt-panel";
import { UserMemoryDialog } from "@/components/user-memory-dialog";

export function ManualConfigPage() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);

  const orgOverrides = useOrgOverrides();
  const updateOrg = useUpdateOrgOverrides();

  const currentOverrides = useMemo(
    () => orgOverrides.data ?? {},
    [orgOverrides.data]
  );

  const handleSaveSlot = useCallback(
    (slot: PromptSlot, value: string) => {
      updateOrg.mutate({ ...currentOverrides, [slot]: value || undefined });
    },
    [currentOverrides, updateOrg]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Prompt Overrides"
        subtitle="Org-wide defaults applied to every conversation unless a Mode overrides them."
      />

      <div className="config-grid-bg min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {orgOverrides.error && (
            <div className="bg-destructive/10 text-destructive border-destructive rounded-lg border-l-2 px-4 py-3 text-sm">
              {orgOverrides.error.message}
            </div>
          )}

          {orgOverrides.isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
              <FontAwesomeIcon
                icon={faSpinnerThird}
                className="size-5 animate-spin"
              />
              <p className="text-sm">Loading overrides...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {PROMPT_SLOTS.filter(
                (slot) => slot !== "tool_guidance" || isAdmin
              ).map((slot) => (
                <PromptPanel
                  key={slot}
                  slot={slot}
                  value={currentOverrides[slot]}
                  onSave={(value) => handleSaveSlot(slot, value)}
                  isSaving={updateOrg.isPending}
                  readOnly={!isAdmin}
                  onViewMemory={
                    slot === "memory_instructions"
                      ? () => setMemoryDialogOpen(true)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <UserMemoryDialog
        open={memoryDialogOpen}
        onOpenChange={setMemoryDialogOpen}
      />
    </div>
  );
}
