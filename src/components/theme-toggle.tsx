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

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="text-muted-foreground hover:bg-accent hover:text-foreground size-10 rounded-none"
        >
          <FontAwesomeIcon
            icon={theme === "dark" ? faMoonLight : faSunBrightLight}
            className="size-[18px]"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {theme === "dark" ? "Light theme" : "Dark theme"}
      </TooltipContent>
    </Tooltip>
  );
}
