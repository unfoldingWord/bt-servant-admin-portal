import { useCallback, useMemo, useState } from "react";
import { faSpinnerThird } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useAuthStore } from "@/lib/auth-store";
import {
  useClearDefaultMode,
  useDeleteMode,
  useMode,
  useModes,
  useOrgOverrides,
  useSaveMode,
  useSetDefaultMode,
  useUpdateOrgOverrides,
} from "@/hooks/use-prompt-config";
import type { PromptOverrides, PromptSlot } from "@/types/prompt-override";
import { PROMPT_SLOTS } from "@/types/prompt-override";
import { ModeSelector } from "@/components/mode-selector";
import { PromptPanel } from "@/components/prompt-panel";

export function ManualConfigPage() {
  const orgName = useAuthStore((s) => s.user?.org);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // Queries
  const orgOverrides = useOrgOverrides();
  const modesQuery = useModes();
  const modeQuery = useMode(selectedMode);

  // Mutations
  const updateOrg = useUpdateOrgOverrides();
  const saveMode = useSaveMode();
  const deleteMode = useDeleteMode();
  const setDefault = useSetDefaultMode();
  const clearDefault = useClearDefaultMode();

  // Current overrides based on selection
  const currentOverrides = useMemo<PromptOverrides>(() => {
    const result =
      selectedMode !== null
        ? (modeQuery.data?.overrides ?? {})
        : (orgOverrides.data ?? {});
    console.log("[manual-config] currentOverrides:", {
      selectedMode,
      orgOverridesData: orgOverrides.data,
      modeQueryData: modeQuery.data,
      result,
    });
    return result;
  }, [selectedMode, modeQuery.data?.overrides, orgOverrides.data]);

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
    [saveMode, orgOverrides.data]
  );

  const handleDeleteMode = useCallback(
    (name: string) => {
      deleteMode.mutate(name, {
        onSuccess: () => setSelectedMode(null),
      });
    },
    [deleteMode]
  );

  const handleSetDefault = useCallback(
    (name: string) => {
      setDefault.mutate(name);
    },
    [setDefault]
  );

  const handleClearDefault = useCallback(() => {
    clearDefault.mutate();
  }, [clearDefault]);

  const isLoading =
    orgOverrides.isLoading ||
    modesQuery.isLoading ||
    (selectedMode !== null && modeQuery.isLoading);

  const error = orgOverrides.error || modesQuery.error || modeQuery.error;

  const isSaving = updateOrg.isPending || saveMode.isPending;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — pinned, never scrolls */}
      <div className="config-header border-border/50 shrink-0 border-b px-4 py-4 sm:px-6 sm:py-5">
        <h1 className="text-foreground text-lg font-semibold tracking-tight">
          Prompt Configuration
        </h1>
        <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
          Manage prompt overrides for each slot at the org level or per mode.
        </p>
        {orgName && (
          <span className="bg-primary/8 text-primary/80 ring-primary/15 dark:bg-primary/12 dark:text-primary/70 dark:ring-primary/20 mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1">
            Org: <em className="ml-1 font-semibold not-italic">{orgName}</em>
          </span>
        )}
      </div>

      {/* Grid area — dot grid + subtle radial glow */}
      <div className="config-grid-bg relative flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
        {/* Mode toolbar */}
        <ModeSelector
          modesData={modesQuery.data}
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          onCreateMode={handleCreateMode}
          onDeleteMode={handleDeleteMode}
          onSetDefault={handleSetDefault}
          onClearDefault={handleClearDefault}
          isCreating={saveMode.isPending}
          isDeleting={deleteMode.isPending}
          isSettingDefault={setDefault.isPending || clearDefault.isPending}
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
            {PROMPT_SLOTS.map((slot) => (
              <PromptPanel
                key={slot}
                slot={slot}
                value={currentOverrides[slot]}
                onSave={(value) => handleSaveSlot(slot, value)}
                isSaving={isSaving}
              />
            ))}
          </div>
        )}

        {/* Version footer */}
        <p className="text-muted-foreground/60 pt-2 text-center text-xs">
          BT Servant Admin Portal v0.3.0
        </p>
      </div>
    </div>
  );
}
