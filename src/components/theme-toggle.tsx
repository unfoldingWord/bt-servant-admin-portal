import { faMoon as faMoonLight } from "@fortawesome/pro-light-svg-icons";
import { faSunBright as faSunBrightLight } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useThemeStore } from "@/lib/theme-store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle({
  tooltipSide = "right",
  showTooltip = true,
}: {
  tooltipSide?: "top" | "right" | "bottom" | "left";
  showTooltip?: boolean;
} = {}) {
  const { theme, toggleTheme } = useThemeStore();

  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="text-muted-foreground hover:!text-primary size-10 rounded-md transition-all hover:!bg-transparent active:scale-95"
    >
      <FontAwesomeIcon
        icon={theme === "dark" ? faSunBrightLight : faMoonLight}
        className="text-xl"
      />
    </Button>
  );

  if (!showTooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        {theme === "dark" ? "Light theme" : "Dark theme"}
      </TooltipContent>
    </Tooltip>
  );
}
