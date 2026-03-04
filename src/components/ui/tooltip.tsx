import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight tooltip using explicit mouse events on the trigger element.
 * Avoids CSS :hover sticking on layout shifts and Radix dismissal bugs.
 */

/* ---------- shared context ---------- */

interface TooltipContextValue {
  tooltipId: string;
  visible: boolean;
  show: () => void;
  hide: () => void;
  hideOnClick: () => void;
}

const TooltipContext = React.createContext<TooltipContextValue>({
  tooltipId: "",
  visible: false,
  show: () => {},
  hide: () => {},
  hideOnClick: () => {},
});

/* ---------- TooltipProvider (no-op wrapper) ---------- */

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* ---------- Tooltip ---------- */

function Tooltip({ children }: { children: React.ReactNode }) {
  const tooltipId = React.useId();
  const [visible, setVisible] = React.useState(false);
  const delayRef = React.useRef<ReturnType<typeof setTimeout>>(null);
  const suppressUntilRef = React.useRef(0);

  const show = React.useCallback(() => {
    if (Date.now() < suppressUntilRef.current) return;
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = setTimeout(() => setVisible(true), 300);
  }, []);

  const hide = React.useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = null;
    setVisible(false);
  }, []);

  const hideOnClick = React.useCallback(() => {
    hide();
    suppressUntilRef.current = Date.now() + 500;
  }, [hide]);

  React.useEffect(() => {
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
    };
  }, []);

  const ctx = React.useMemo(
    () => ({ tooltipId, visible, show, hide, hideOnClick }),
    [tooltipId, visible, show, hide, hideOnClick]
  );

  return (
    <TooltipContext.Provider value={ctx}>
      <div className="relative inline-flex">{children}</div>
    </TooltipContext.Provider>
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
  const { tooltipId, show, hide, hideOnClick } =
    React.useContext(TooltipContext);

  const eventProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onPointerDown: hideOnClick,
    "aria-describedby": tooltipId,
  };

  if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
    return React.cloneElement(children, { ...eventProps, ...rest });
  }
  return (
    <div {...eventProps} {...rest}>
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
  const { tooltipId, visible } = React.useContext(TooltipContext);

  return (
    <div
      id={tooltipId}
      role="tooltip"
      className={cn(
        "bg-foreground text-background pointer-events-none absolute z-50 w-max max-w-xs rounded-md px-3 py-1.5 text-xs",
        "transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0",
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
