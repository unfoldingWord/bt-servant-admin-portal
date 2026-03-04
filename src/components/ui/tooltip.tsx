import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Pure-CSS tooltip system. Tooltips appear on hover after a short delay
 * and vanish instantly on mouse-leave. No JS state management needed.
 *
 * API mirrors the old Radix-based components so existing call-sites
 * don't need to change.
 */

/* ---------- shared context for aria-describedby wiring ---------- */

const TooltipIdContext = React.createContext<string | undefined>(undefined);

/* ---------- TooltipProvider (no-op wrapper) ---------- */

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* ---------- Tooltip (group wrapper) ---------- */

function Tooltip({
  children,
  ...rest
}: {
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const id = React.useId();
  return (
    <TooltipIdContext.Provider value={id}>
      <div className="group/tooltip relative inline-flex" {...rest}>
        {children}
      </div>
    </TooltipIdContext.Provider>
  );
}

/* ---------- TooltipTrigger ---------- */

function TooltipTrigger({
  asChild,
  children,
  ...rest
}: {
  asChild?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const tooltipId = React.useContext(TooltipIdContext);

  if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
    return React.cloneElement(children, {
      "aria-describedby": tooltipId,
      ...rest,
    });
  }
  return (
    <div aria-describedby={tooltipId} {...rest}>
      {children}
    </div>
  );
}

/* ---------- TooltipContent ---------- */

type Side = "top" | "right" | "bottom" | "left";

const sideStyles: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

function TooltipContent({
  className,
  side = "top",
  children,
  ...props
}: {
  className?: string;
  side?: Side;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const tooltipId = React.useContext(TooltipIdContext);

  return (
    <div
      id={tooltipId}
      role="tooltip"
      className={cn(
        "bg-foreground text-background pointer-events-none absolute z-50 w-max max-w-xs rounded-md px-3 py-1.5 text-xs",
        "opacity-0 transition-opacity duration-150",
        "group-hover/tooltip:opacity-100 group-hover/tooltip:delay-300",
        "group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:delay-300",
        sideStyles[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
