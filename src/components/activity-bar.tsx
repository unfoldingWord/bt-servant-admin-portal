import { faComments as faCommentsLight } from "@fortawesome/pro-light-svg-icons";
import { faMessageBot as faMessageBotLight } from "@fortawesome/pro-light-svg-icons";
import { faServer as faServerLight } from "@fortawesome/pro-light-svg-icons";
import { faSliders as faSlidersLight } from "@fortawesome/pro-light-svg-icons";
import { faComments as faCommentsSolid } from "@fortawesome/pro-solid-svg-icons";
import { faMessageBot as faMessageBotSolid } from "@fortawesome/pro-solid-svg-icons";
import { faServer as faServerSolid } from "@fortawesome/pro-solid-svg-icons";
import { faSliders as faSlidersSolid } from "@fortawesome/pro-solid-svg-icons";
import { useNavigate } from "react-router";

import { useUiStore } from "@/lib/ui-store";
import { Separator } from "@/components/ui/separator";
import { ActivityBarItem } from "@/components/activity-bar-item";
import { ThemeToggle } from "@/components/theme-toggle";

export function ActivityBar() {
  const navigate = useNavigate();
  const { activeSection, testChatOpen, toggleTestChat } = useUiStore();

  return (
    <div className="bg-card flex h-full w-12 flex-col items-center border-r py-2">
      <div className="flex flex-col items-center gap-1">
        <ActivityBarItem
          icon={faMessageBotLight}
          activeIcon={faMessageBotSolid}
          label="Baruch"
          isActive={activeSection === "baruch"}
          onClick={() => void navigate("/")}
        />
        <ActivityBarItem
          icon={faCommentsLight}
          activeIcon={faCommentsSolid}
          label="Test Chat"
          isActive={testChatOpen}
          onClick={toggleTestChat}
        />
        <Separator className="my-1 w-6" />
        <ActivityBarItem
          icon={faServerLight}
          activeIcon={faServerSolid}
          label="MCP Servers"
          isActive={activeSection === "mcp-servers"}
          onClick={() => void navigate("/mcp-servers")}
        />
        <ActivityBarItem
          icon={faSlidersLight}
          activeIcon={faSlidersSolid}
          label="Advanced Options"
          isActive={activeSection === "advanced-options"}
          onClick={() => void navigate("/advanced-options")}
        />
      </div>

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
