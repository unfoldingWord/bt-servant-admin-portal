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
}

export function ActivityBarItem({
  icon,
  activeIcon,
  label,
  isActive,
  onClick,
}: ActivityBarItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "text-muted-foreground relative size-10 rounded-none transition-colors",
            "hover:bg-accent hover:text-foreground",
            isActive &&
              "text-foreground before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-0.5"
          )}
        >
          <FontAwesomeIcon
            icon={isActive ? activeIcon : icon}
            className="size-[18px]"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
