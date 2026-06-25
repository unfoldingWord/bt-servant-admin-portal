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
import {
  hasAdminPowers,
  hasAnyLanguageAccess,
  hasAnyModeAccess,
} from "@/lib/permissions";
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
  const user = useAuthStore((s) => s.user);
  // Uses hasAdminPowers so super admins (even without isAdmin) see the
  // Users entry. Mirrors worker's "super trumps" rule.
  const isAdmin = hasAdminPowers(user);
  // #181 — sidebar gates now consult the verb-perms union helpers so
  // users granted via the new dialog (no legacy `language_rights`)
  // correctly see their entry points. `hasAnyLanguageAccess` retains
  // the legacy `undefined → full access` rule for pre-#181 users;
  // `hasAnyModeAccess` does NOT (modes had no per-row pre-#181 so
  // undefined-undefined means "no access" for non-admins), which is
  // why the Modes entry combines it with the admin trump.
  const canAccessLanguages = hasAnyLanguageAccess(user);
  const canEditModes = isAdmin || hasAnyModeAccess(user);

  return (
    <div className="bg-card relative z-10 flex h-full w-12 flex-col items-center py-3 shadow-[2px_0_12px_rgba(0,0,0,0.2)] dark:shadow-[2px_0_12px_rgba(0,0,0,0.35)]">
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
        {canEditModes && (
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
