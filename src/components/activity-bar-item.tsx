import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActivityBarItemProps {
  icon: IconDefinition;
  activeIcon: IconDefinition;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}

export function ActivityBarItem({
  icon,
  activeIcon,
  label,
  isActive,
  onClick,
  disabled = false,
  disabledLabel,
}: ActivityBarItemProps) {
  const tooltipText = disabled && disabledLabel ? disabledLabel : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={disabled ? undefined : onClick}
          aria-label={tooltipText}
          aria-disabled={disabled}
          data-disabled={disabled || undefined}
          className={cn(
            "text-muted-foreground relative size-10 rounded-md transition-all",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2",
            // Dark-mode hover uses a white overlay because the accent token is
            // only 0.073 L away from the card surface — below the perceptibility
            // threshold for a hover state. Issue #12.
            !disabled &&
              "hover:bg-accent hover:text-foreground hover:shadow-sm active:scale-95 dark:hover:bg-white/[0.08]",
            disabled && "cursor-not-allowed opacity-40",
            // Active state pairs the left-edge primary strip with a subtle
            // background fill so the signal isn't carried on a 2px stripe + a
            // small text lightness delta alone. Issue #13.
            isActive &&
              !disabled &&
              "bg-primary/8 text-foreground dark:bg-primary/12 before:bg-primary before:absolute before:inset-y-1.5 before:-left-1 before:w-0.5 before:rounded-full before:transition-all"
          )}
        >
          <FontAwesomeIcon
            icon={isActive && !disabled ? activeIcon : icon}
            className="text-xl"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
