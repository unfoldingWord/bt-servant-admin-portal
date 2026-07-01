import { useNavigate } from "react-router";
import { ArrowUpRight } from "lucide-react";

import { useUiStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";

interface Props {
  // The org whose language list is empty — shown in the message and the
  // org the Languages page should land in.
  org: string;
  // The org-context value to set before navigating: the target org slug
  // for a cross-org super-admin, or null for the caller's home org. The
  // Languages page reads `contextOrg` from the ui-store, so setting it
  // here drops the admin straight into the right namespace.
  contextOrg: string | null;
  // Close the host dialog before we navigate away. The admin is
  // deliberately leaving to create the draft; the half-filled user form
  // is abandoned by design (they hadn't committed anything yet).
  onNavigateAway: () => void;
}

// #247: the create/edit-user dialogs assign rights against languages
// that already exist. When the target org has NO language drafts yet,
// specific-language scope can't be granted here — there's nothing to
// tick. Rather than create the draft inline (which couples two writes
// and a mutable org target inside one dialog — a race/staleness bug
// farm), point the admin at the Languages page, which is the purpose-
// built, already-hardened home for draft creation. They create the
// first draft there, come back, and the list is populated.
export function LanguageBootstrapCta({
  org,
  contextOrg,
  onNavigateAway,
}: Props) {
  const navigate = useNavigate();
  const setContextOrg = useUiStore((s) => s.setContextOrg);

  const handleClick = () => {
    setContextOrg(contextOrg);
    onNavigateAway();
    void navigate("/languages");
  };

  return (
    <div className="bg-muted/40 space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">
        No language drafts in <span className="font-mono text-xs">{org}</span>{" "}
        yet
      </p>
      <p className="text-muted-foreground text-xs">
        Specific-language access can only be granted once a draft exists. Create
        the first one on the Languages page, then come back to assign it.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={handleClick}>
        Open Languages page
        <ArrowUpRight className="ml-1.5 size-3.5" />
      </Button>
    </div>
  );
}
