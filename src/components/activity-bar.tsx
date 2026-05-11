import { faComments as faCommentsLight } from "@fortawesome/pro-light-svg-icons";
import { faLanguage as faLanguageLight } from "@fortawesome/pro-light-svg-icons";
import { faMessageBot as faMessageBotLight } from "@fortawesome/pro-light-svg-icons";
import { faPenToSquare as faPenToSquareLight } from "@fortawesome/pro-light-svg-icons";
import { faUsers as faUsersLight } from "@fortawesome/pro-light-svg-icons";
import { faComments as faCommentsSolid } from "@fortawesome/pro-solid-svg-icons";
import { faLanguage as faLanguageSolid } from "@fortawesome/pro-solid-svg-icons";
import { faMessageBot as faMessageBotSolid } from "@fortawesome/pro-solid-svg-icons";
import { faPenToSquare as faPenToSquareSolid } from "@fortawesome/pro-solid-svg-icons";
import { faUsers as faUsersSolid } from "@fortawesome/pro-solid-svg-icons";
import { useNavigate } from "react-router";

import { useAuthStore } from "@/lib/auth-store";
import { hasAnyLanguageRights } from "@/lib/permissions";
import { useUiStore } from "@/lib/ui-store";
import { Separator } from "@/components/ui/separator";
import { ActivityBarItem } from "@/components/activity-bar-item";
import { UserMenu } from "@/components/user-menu";

export function ActivityBar() {
  const navigate = useNavigate();
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const testChatOpen = useUiStore((s) => s.testChatOpen);
  const toggleTestChat = useUiStore((s) => s.toggleTestChat);
  const languageRights = useAuthStore((s) => s.user?.language_rights);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const canAccessLanguages = hasAnyLanguageRights(languageRights);

  return (
    <div className="bg-card relative z-10 flex h-full w-12 flex-col items-center py-3 shadow-[2px_0_12px_rgba(0,0,0,0.2)]">
      <div className="flex flex-col items-center gap-1.5">
        <ActivityBarItem
          icon={faMessageBotLight}
          activeIcon={faMessageBotSolid}
          label="Talk to Baruch to configure your BT Servant agent"
          isActive={activeSection === "baruch"}
          onClick={() => {
            setActiveSection("baruch");
            void navigate("/");
          }}
        />
        {isAdmin && (
          <ActivityBarItem
            icon={faPenToSquareLight}
            activeIcon={faPenToSquareSolid}
            label="Edit prompt modes"
            isActive={activeSection === "modes"}
            onClick={() => {
              setActiveSection("modes");
              void navigate("/modes");
            }}
          />
        )}
        <ActivityBarItem
          icon={faLanguageLight}
          activeIcon={faLanguageSolid}
          label="Edit per-language tuning documents"
          isActive={activeSection === "languages"}
          onClick={() => {
            setActiveSection("languages");
            void navigate("/languages");
          }}
          disabled={!canAccessLanguages}
          disabledLabel="No language access — contact your admin"
        />
        {isAdmin && (
          <ActivityBarItem
            icon={faUsersLight}
            activeIcon={faUsersSolid}
            label="Manage users in your org"
            isActive={activeSection === "admin-users"}
            onClick={() => {
              setActiveSection("admin-users");
              void navigate("/admin/users");
            }}
          />
        )}
        <Separator className="my-1.5 w-5 opacity-50" />
        <ActivityBarItem
          icon={faCommentsLight}
          activeIcon={faCommentsSolid}
          label="Chat with BT Servant"
          isActive={testChatOpen}
          onClick={toggleTestChat}
        />
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <UserMenu />
      </div>
    </div>
  );
}
