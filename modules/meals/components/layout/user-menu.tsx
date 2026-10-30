"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { logoutAction } from "@meals/actions/auth";
import { TransitionLink } from "@meals/components/layout/transition-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@meals/components/ui/dropdown-menu";
import {
  persistTheme,
  resolveTheme,
  type Theme,
} from "@meals/lib/theme";
import { cn } from "@meals/lib/utils";

export type UserMenuUser = {
  name: string;
  email: string;
};

function userInitials(name: string, email: string) {
  const trimmed = name.trim();
  if (trimmed && trimmed.toLowerCase() !== email.toLowerCase()) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "U";
  return local.slice(0, 2).toUpperCase();
}

export function UserMenu({
  user,
  align = "end",
  side = "bottom",
}: {
  user: UserMenuUser;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/tools/meals/settings");
  const initials = userInitials(user.name, user.email);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initial = resolveTheme();
    setTheme(initial);
    setThemeReady(true);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persistTheme(next);
  }

  const trigger = (
    <button
      type="button"
      aria-label="Account menu"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold tracking-wide text-primary-foreground shadow-sm shadow-primary/20 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] data-[state=open]:ring-2 data-[state=open]:ring-ring data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-background",
        settingsActive &&
          "ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
    >
      {initials}
    </button>
  );

  if (!mounted) {
    return trigger;
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        avoidCollisions={false}
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <TransitionLink href="/tools/meals/settings">
            <Settings aria-hidden />
            Settings
          </TransitionLink>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!themeReady}
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          {!themeReady ? (
            <Moon aria-hidden />
          ) : theme === "dark" ? (
            <Sun aria-hidden />
          ) : (
            <Moon aria-hidden />
          )}
          {!themeReady
            ? "Theme"
            : theme === "dark"
              ? "Light theme"
              : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => {
            void logoutAction();
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
