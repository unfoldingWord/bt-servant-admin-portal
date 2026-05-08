import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  // Subtle context accent: tints a 3px top strip with a brand color so authors
  // can tell at a glance which kind of document they're editing (issue #78).
  variant?: "modes" | "languages";
}

export function PageHeader({ title, subtitle, variant }: PageHeaderProps) {
  const orgName = useAuthStore((s) => s.user?.org);

  const accentColor =
    variant === "modes"
      ? "var(--brand-modes)"
      : variant === "languages"
        ? "var(--brand-languages)"
        : undefined;

  return (
    <div
      className={cn(
        "config-header border-border/50 shrink-0 border-b px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5 dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
        accentColor && "border-t-[3px]"
      )}
      style={accentColor ? { borderTopColor: accentColor } : undefined}
    >
      <h1 className="text-foreground text-lg font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
        {subtitle}
      </p>
      {orgName && (
        <span className="bg-primary/8 text-primary/80 ring-primary/15 dark:bg-primary/12 dark:text-primary/70 dark:ring-primary/20 mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1">
          Org: <em className="ml-1 font-semibold not-italic">{orgName}</em>
        </span>
      )}
    </div>
  );
}
