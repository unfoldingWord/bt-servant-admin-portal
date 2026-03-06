import { faRightFromBracket } from "@fortawesome/pro-light-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useAuthStore } from "@/lib/auth-store";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();

  const initial = (user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="User menu"
          className="bg-primary text-primary-foreground hover:bg-primary/85 flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-48">
        <DropdownMenuLabel className="truncate font-normal">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-muted-foreground text-xs">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <FontAwesomeIcon icon={faRightFromBracket} className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="text-muted-foreground/50 px-2 py-1.5 text-[10px]">
          BAP v0.4.0
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
