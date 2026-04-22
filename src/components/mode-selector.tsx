import { useCallback, useState } from "react";
import { faLayerGroup } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Eye, EyeOff, Plus, Send, SendHorizontal, Trash2 } from "lucide-react";

import type { OrgModes, PromptMode } from "@/types/prompt-override";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ModeSelectorProps {
  modesData: OrgModes | undefined;
  selectedMode: string | null;
  onSelectMode: (mode: string | null) => void;
  onCreateMode: (name: string, label: string, description: string) => void;
  onDeleteMode: (name: string) => void;
  onSetPublished: (name: string, published: boolean) => void;
  isCreating: boolean;
  isDeleting: boolean;
  isSettingPublished: boolean;
  showDrafts: boolean;
  onToggleShowDrafts: (showDrafts: boolean) => void;
  isAdmin: boolean;
}

function isPublished(mode: Pick<PromptMode, "published">): boolean {
  return mode.published === true;
}

export function ModeSelector({
  modesData,
  selectedMode,
  onSelectMode,
  onCreateMode,
  onDeleteMode,
  onSetPublished,
  isCreating,
  isDeleting,
  isSettingPublished,
  showDrafts,
  onToggleShowDrafts,
  isAdmin,
}: ModeSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const modes = modesData?.modes ?? [];
  const selectedModeData = modes.find((m) => m.name === selectedMode) ?? null;
  const selectedIsPublished = selectedModeData
    ? isPublished(selectedModeData)
    : false;

  // If drafts are hidden, still show the currently-selected draft so we don't
  // orphan the user's selection.
  const visibleModes = modes.filter(
    (m) => showDrafts || isPublished(m) || m.name === selectedMode
  );

  const handleCreate = useCallback(() => {
    const slug = newName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug) return;
    onCreateMode(slug, newLabel.trim(), newDescription.trim());
    setNewName("");
    setNewLabel("");
    setNewDescription("");
    setShowCreate(false);
  }, [newName, newLabel, newDescription, onCreateMode]);

  const handleSelectChange = useCallback(
    (value: string) => {
      onSelectMode(value === "__org__" ? null : value);
    },
    [onSelectMode]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-initial">
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <FontAwesomeIcon icon={faLayerGroup} className="text-sm" />
          </div>
          <Select
            value={selectedMode ?? "__org__"}
            onValueChange={handleSelectChange}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__org__">Org Defaults</SelectItem>
              {visibleModes.length > 0 && <SelectSeparator />}
              {visibleModes.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{m.label || m.name}</span>
                    {!isPublished(m) && (
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0 text-[10px]"
                      >
                        Draft
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleShowDrafts(!showDrafts)}
          title={showDrafts ? "Hide drafts from the list" : "Show drafts"}
        >
          {showDrafts ? (
            <Eye className="mr-1.5 size-3.5" />
          ) : (
            <EyeOff className="mr-1.5 size-3.5" />
          )}
          {showDrafts ? "Drafts shown" : "Drafts hidden"}
        </Button>

        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1.5 size-3.5" />
          New Mode
        </Button>

        {selectedMode !== null && selectedModeData && (
          <div className="border-border flex items-center gap-2 sm:border-l sm:pl-3">
            <Badge
              variant={selectedIsPublished ? "default" : "outline"}
              className="shrink-0"
            >
              {selectedIsPublished ? "Published" : "Draft"}
            </Badge>

            {isAdmin &&
              (selectedIsPublished ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSettingPublished}
                    >
                      <SendHorizontal className="mr-1.5 size-3.5" />
                      Unpublish
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unpublish mode?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This mode will immediately disappear for all end users.
                        Admins will still be able to see and edit it as a draft.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onSetPublished(selectedMode, false)}
                      >
                        Unpublish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSettingPublished}
                  onClick={() => onSetPublished(selectedMode, true)}
                >
                  <Send className="mr-1.5 size-3.5" />
                  Publish
                </Button>
              ))}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete mode</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete{" "}
                    <span className="text-foreground font-medium">
                      &ldquo;{selectedMode}&rdquo;
                    </span>
                    ? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => onDeleteMode(selectedMode)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="bg-card animate-in fade-in slide-in-from-bottom-4 rounded-xl border p-4 shadow-sm duration-200">
          <p className="text-foreground mb-3 text-sm font-medium">
            Create a new mode
          </p>
          <p className="text-muted-foreground mb-3 text-xs">
            New modes are created as drafts and are not visible to end users
            until published.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mode-name" className="text-xs">
                Name (slug)
              </Label>
              <Input
                id="mode-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. kids-mode"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mode-label" className="text-xs">
                Display Label
              </Label>
              <Input
                id="mode-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Kids Mode"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mode-desc" className="text-xs">
              Description
            </Label>
            <Textarea
              id="mode-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional description for this mode..."
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
