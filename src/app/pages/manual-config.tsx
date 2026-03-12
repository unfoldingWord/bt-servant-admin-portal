import { useCallback, useMemo } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useAuthStore } from "@/lib/auth-store";
import { useUiStore } from "@/lib/ui-store";
import { PageHeader } from "@/components/page-header";
import {
  useDeleteMode,
  useMode,
  useModes,
  useOrgOverrides,
  useSaveMode,
  useUpdateOrgOverrides,
} from "@/hooks/use-prompt-config";
import type { PromptOverrides, PromptSlot } from "@/types/prompt-override";
import { PROMPT_SLOTS } from "@/types/prompt-override";
import { ModeSelector } from "@/components/mode-selector";
import { PromptPanel } from "@/components/prompt-panel";

export function ManualConfigPage() {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const selectedMode = useUiStore((s) => s.selectedMode);
  const setSelectedMode = useUiStore((s) => s.setSelectedMode);

  // Queries
  const orgOverrides = useOrgOverrides();
  const modesQuery = useModes();
  const modeQuery = useMode(selectedMode);

  // Mutations
  const updateOrg = useUpdateOrgOverrides();
  const saveMode = useSaveMode();
  const deleteMode = useDeleteMode();

  // Current overrides based on selection
  const currentOverrides = useMemo<PromptOverrides>(
    () =>
      selectedMode !== null
        ? (modeQuery.data?.overrides ?? {})
        : (orgOverrides.data ?? {}),
    [selectedMode, modeQuery.data?.overrides, orgOverrides.data]
  );

  const handleSaveSlot = useCallback(
    (slot: PromptSlot, value: string) => {
      const updated = { ...currentOverrides, [slot]: value || undefined };

      if (selectedMode !== null) {
        saveMode.mutate({
          name: selectedMode,
          body: {
            label: modeQuery.data?.label,
            description: modeQuery.data?.description,
            overrides: updated,
          },
        });
      } else {
        updateOrg.mutate(updated);
      }
    },
    [currentOverrides, selectedMode, modeQuery.data, saveMode, updateOrg]
  );

  const handleCreateMode = useCallback(
    (name: string, label: string, description: string) => {
      saveMode.mutate(
        {
          name,
          body: {
            label: label || undefined,
            description: description || undefined,
            overrides: orgOverrides.data ?? {},
          },
        },
        { onSuccess: () => setSelectedMode(name) }
      );
    },
    [saveMode, orgOverrides.data, setSelectedMode]
  );

  const handleDeleteMode = useCallback(
    (name: string) => {
      deleteMode.mutate(name, {
        onSuccess: () => setSelectedMode(null),
      });
    },
    [deleteMode, setSelectedMode]
  );

  const isLoading =
    orgOverrides.isLoading ||
    modesQuery.isLoading ||
    (selectedMode !== null && modeQuery.isLoading);

  const error =
    orgOverrides.error ||
    modesQuery.error ||
    (selectedMode !== null ? modeQuery.error : null);

  const isSaving = updateOrg.isPending || saveMode.isPending;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Prompt Configuration"
        subtitle="Manage prompt overrides for each slot at the org level or per mode."
      />

      {/* Grid area — dot grid + subtle radial glow */}
      <div className="config-grid-bg min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Mode toolbar */}
          <ModeSelector
            modesData={modesQuery.data}
            selectedMode={selectedMode}
            onSelectMode={setSelectedMode}
            onCreateMode={handleCreateMode}
            onDeleteMode={handleDeleteMode}
            isCreating={saveMode.isPending}
            isDeleting={deleteMode.isPending}
          />

          {/* Error banner */}
          {error && (
            <div className="bg-destructive/10 text-destructive border-destructive rounded-lg border-l-2 px-4 py-3 text-sm">
              {error.message}
            </div>
          )}

          {/* Slot grid */}
          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
              <FontAwesomeIcon
                icon={faSpinnerThird}
                className="size-5 animate-spin"
              />
              <p className="text-sm">Loading configuration...</p>
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
                  isSaving={isSaving}
                  readOnly={selectedMode === null && !isAdmin}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
