import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

// How the admin should reach a place where they can create the first
// draft, given where the CTA is shown:
//
// - "direct": a fresh Languages tab already lands in the right org (the
//   caller's home org). Open it, create the draft, come back.
// - "switch-org": edit dialog, cross-org super-admin. The target org
//   has an existing user (the one being edited), so it IS reachable via
//   the Languages page org selector — just needs switching to.
// - "save-user-first": create dialog, cross-org super-admin. The target
//   org may be brand-new (no users yet, since the user is still
//   unsaved), so it isn't reachable via the org selector at all (its
//   option list is users-derived). Telling them to switch the selector
//   would be an impossible instruction (rd-4 F1); the correct path is to
//   save the user first, which provisions the org, then add the draft
//   and grant it by editing the user.
type BootstrapMode = "direct" | "switch-org" | "save-user-first";

interface Props {
  // The org whose language list is empty — named in the message.
  org: string;
  mode: BootstrapMode;
}

// #247: the create/edit-user dialogs assign rights against languages
// that already exist. When the target org has NO language drafts yet,
// specific-language scope can't be granted here — there's nothing to
// tick. Rather than create the draft inline (which coupled two writes +
// a mutable org target inside one dialog — a race/staleness bug farm
// across two review rounds), point the admin at the Languages page.
//
// The "direct" / "switch-org" variants open the page in a NEW TAB so the
// host dialog stays open and mid-flow — no half-entered form / rights
// toggles are lost, and on return the dialog's languages query refetches
// on window focus so the new draft appears to be assigned. No global org
// context is mutated (a "go here" button shouldn't silently repoint
// other config pages).
export function LanguageBootstrapCta({ org, mode }: Props) {
  const orgName = <span className="font-mono text-xs">{org}</span>;

  if (mode === "save-user-first") {
    return (
      <div className="bg-muted/40 space-y-2 rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">
          No language drafts in {orgName} yet
        </p>
        <p className="text-muted-foreground text-xs">
          Specific-language access can only be granted once a draft exists. Save
          this user first, then add the first draft from the Languages page and
          grant it by editing the user.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">No language drafts in {orgName} yet</p>
      <p className="text-muted-foreground text-xs">
        Specific-language access can only be granted once a draft exists. Create
        the first one on the Languages page, then come back to this dialog to
        assign it.
        {mode === "switch-org" && (
          <> Use the org selector there to switch to {orgName} first.</>
        )}
      </p>
      <Button asChild size="sm" variant="outline">
        <a href="/languages" target="_blank" rel="noopener noreferrer">
          Open Languages page
          <ArrowUpRight className="ml-1.5 size-3.5" />
        </a>
      </Button>
    </div>
  );
}
