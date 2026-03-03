import { faComments as faCommentsLight } from "@fortawesome/pro-light-svg-icons";
import { faMessageBot as faMessageBotLight } from "@fortawesome/pro-light-svg-icons";
import { faPenToSquare as faPenToSquareLight } from "@fortawesome/pro-light-svg-icons";
import { faComments as faCommentsSolid } from "@fortawesome/pro-solid-svg-icons";
import { faMessageBot as faMessageBotSolid } from "@fortawesome/pro-solid-svg-icons";
import { faPenToSquare as faPenToSquareSolid } from "@fortawesome/pro-solid-svg-icons";
import { useNavigate } from "react-router";

import { useUiStore } from "@/lib/ui-store";
import { Separator } from "@/components/ui/separator";
import { ActivityBarItem } from "@/components/activity-bar-item";
import { ThemeToggle } from "@/components/theme-toggle";

export function ActivityBar() {
  const navigate = useNavigate();
  const { activeSection, setActiveSection, testChatOpen, toggleTestChat } =
    useUiStore();

  return (
    <div className="bg-card relative z-10 flex h-full w-12 flex-col items-center py-3 shadow-[2px_0_12px_rgba(0,0,0,0.2)]">
      <div className="flex flex-col items-center gap-1.5">
        <ActivityBarItem
          icon={faMessageBotLight}
          activeIcon={faMessageBotSolid}
          label="Baruch"
          isActive={activeSection === "baruch"}
          onClick={() => {
            setActiveSection("baruch");
            void navigate("/");
          }}
        />
        <ActivityBarItem
          icon={faPenToSquareLight}
          activeIcon={faPenToSquareSolid}
          label="Manual Config"
          isActive={activeSection === "manual-config"}
          onClick={() => {
            setActiveSection("manual-config");
            void navigate("/manual-config");
          }}
        />
        <Separator className="my-1.5 w-5 opacity-50" />
        <ActivityBarItem
          icon={faCommentsLight}
          activeIcon={faCommentsSolid}
          label="Test Chat"
          isActive={testChatOpen}
          onClick={toggleTestChat}
        />
      </div>

      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
