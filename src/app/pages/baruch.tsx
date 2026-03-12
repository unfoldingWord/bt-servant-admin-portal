import { BaruchChatPane } from "@/components/baruch-chat-pane";
import { useAuthStore } from "@/lib/auth-store";

export function BaruchPage() {
  const orgName = useAuthStore((s) => s.user?.org);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — pinned, never scrolls */}
      <div className="config-header border-border/50 shrink-0 border-b px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5 dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
        <h1 className="text-foreground text-lg font-semibold tracking-tight">
          Baruch Configuration Guide
        </h1>
        <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
          Talk to Baruch to configure your BT Servant agent — name, identity,
          teaching methodology, tool guidance, instructions, memory
          instructions, and closing prompt.
        </p>
        {orgName && (
          <span className="bg-primary/8 text-primary/80 ring-primary/15 dark:bg-primary/12 dark:text-primary/70 dark:ring-primary/20 mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1">
            Org: <em className="ml-1 font-semibold not-italic">{orgName}</em>
          </span>
        )}
      </div>

      {/* Chat area — dot grid background */}
      <div className="bg-dot-grid min-h-0 flex-1 overflow-hidden">
        <BaruchChatPane />
      </div>
    </div>
  );
}
