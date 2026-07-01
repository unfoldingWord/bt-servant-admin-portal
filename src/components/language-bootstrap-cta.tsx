import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  // The org whose language list is empty — named in the message.
  org: string;
  // True when the caller is a super-admin working in an org other than
  // their home org. Only affects copy: a fresh Languages-page tab boots
  // in the caller's home context, so a cross-org admin has to switch the
  // org selector there before creating the draft.
  isCrossOrg: boolean;
}

// #247: the create/edit-user dialogs assign rights against languages
// that already exist. When the target org has NO language drafts yet,
// specific-language scope can't be granted here — there's nothing to
// tick. Rather than create the draft inline (which coupled two writes +
// a mutable org target inside one dialog — a race/staleness bug farm
// across two review rounds), point the admin at the Languages page, the
// purpose-built home for draft creation.
//
// Opens in a NEW TAB deliberately: the host dialog stays open and
// mid-flow, so no half-entered user form / rights toggles are lost
// (rd-3 F4). On return, the dialog's languages query refetches on window
// focus and the new draft appears in the rights matrix to be assigned.
// We don't touch the global org context here — a button labeled "Open
// Languages page" shouldn't silently repoint every other config page's
// org (rd-3 F5); the Languages page's own org selector owns that switch.
export function LanguageBootstrapCta({ org, isCrossOrg }: Props) {
  return (
    <div className="bg-muted/40 space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">
        No language drafts in <span className="font-mono text-xs">{org}</span>{" "}
        yet
      </p>
      <p className="text-muted-foreground text-xs">
        Specific-language access can only be granted once a draft exists. Create
        the first one on the Languages page, then come back to this dialog to
        assign it.
        {isCrossOrg && (
          <>
            {" "}
            Use the org selector there to switch to{" "}
            <span className="font-mono">{org}</span> first.
          </>
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
