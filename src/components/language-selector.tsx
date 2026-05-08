import { useCallback, useState } from "react";
import { faLanguage } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Eye, EyeOff, Plus, Send, SendHorizontal, Trash2 } from "lucide-react";

import type { Language, OrgLanguages } from "@/types/language";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LanguageSelectorProps {
  languagesData: OrgLanguages | undefined;
  selectedLanguage: string | null;
  onSelectLanguage: (language: string | null) => void;
  onCreateLanguage: (name: string, label: string) => void;
  onDeleteLanguage: (name: string) => void;
  onSetPublished: (name: string, published: boolean) => void;
  isCreating: boolean;
  isDeleting: boolean;
  isSettingPublished: boolean;
  showDrafts: boolean;
  onToggleShowDrafts: (showDrafts: boolean) => void;
  isAdmin: boolean;
}

function isPublished(lang: Pick<Language, "published">): boolean {
  return lang.published === true;
}

export function LanguageSelector({
  languagesData,
  selectedLanguage,
  onSelectLanguage,
  onCreateLanguage,
  onDeleteLanguage,
  onSetPublished,
  isCreating,
  isDeleting,
  isSettingPublished,
  showDrafts,
  onToggleShowDrafts,
  isAdmin,
}: LanguageSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const languages = languagesData?.languages ?? [];
  const selectedData =
    languages.find((l) => l.name === selectedLanguage) ?? null;
  const selectedIsPublished = selectedData ? isPublished(selectedData) : false;

  const visibleLanguages = languages.filter(
    (l) => showDrafts || isPublished(l) || l.name === selectedLanguage
  );

  const handleCreate = useCallback(() => {
    const slug = newName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug) return;
    onCreateLanguage(slug, newLabel.trim());
    setNewName("");
    setNewLabel("");
    setShowCreate(false);
  }, [newName, newLabel, onCreateLanguage]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-initial">
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <FontAwesomeIcon icon={faLanguage} className="text-base" />
          </div>
          <Select
            value={selectedLanguage ?? ""}
            onValueChange={(value) =>
              onSelectLanguage(value === "" ? null : value)
            }
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {visibleLanguages.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-xs">
                  No languages yet
                </div>
              ) : (
                visibleLanguages.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{l.label || l.name}</span>
                      {!isPublished(l) && (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          Draft
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))
              )}
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

        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1.5 size-3.5" />
            New Language
          </Button>
        )}

        {selectedLanguage !== null && selectedData && (
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
                      <AlertDialogTitle>Unpublish language?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This language will immediately stop shaping responses
                        for end users. Admins will still be able to see and edit
                        it as a draft.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onSetPublished(selectedLanguage, false)}
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
                  onClick={() => onSetPublished(selectedLanguage, true)}
                >
                  <Send className="mr-1.5 size-3.5" />
                  Publish
                </Button>
              ))}

            {isAdmin && (
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
                    <AlertDialogTitle>Delete language</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete{" "}
                      <span className="text-foreground font-medium">
                        &ldquo;{selectedLanguage}&rdquo;
                      </span>
                      ? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => onDeleteLanguage(selectedLanguage)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="bg-card animate-in fade-in slide-in-from-bottom-4 rounded-xl border p-4 shadow-sm duration-200">
          <p className="text-foreground mb-3 text-sm font-medium">
            Create a new language
          </p>
          <p className="text-muted-foreground mb-3 text-xs">
            New languages are created as drafts and don&rsquo;t shape responses
            until published.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lang-name" className="text-xs">
                Name (slug)
              </Label>
              <Input
                id="lang-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. arabic"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lang-label" className="text-xs">
                Display Label
              </Label>
              <Input
                id="lang-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Arabic"
                className="h-8 text-sm"
              />
            </div>
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
