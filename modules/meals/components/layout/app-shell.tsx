"use client";

import { usePathname } from "next/navigation";
import { MOBILE_NAV_ITEMS, NAV_ITEMS } from "@meals/components/layout/nav-items";
import { AppPageTransition } from "@meals/components/layout/app-page-transition";
import { TransitionLink } from "@meals/components/layout/transition-link";
import {
  UserMenu,
  type UserMenuUser,
} from "@meals/components/layout/user-menu";
import { APP_NAME } from "@meals/lib/brand";
import { cn } from "@meals/lib/utils";

export function AppShell({
  user,
  children,
}: {
  user: UserMenuUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] overflow-x-hidden md:gap-0">
      <aside className="app-shell-chrome hidden w-60 shrink-0 border-r border-border/60 bg-[linear-gradient(180deg,var(--card)_0%,color-mix(in_srgb,var(--surface-warm)_88%,var(--card)_12%)_48%,var(--muted)_100%)] px-4 py-5 max-md:!hidden md:flex md:flex-col">
        <div className="mb-10 min-w-0 px-1">
          <p className="font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-primary">
            {APP_NAME}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <TransitionLink
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[0.9375rem] font-medium transition-[color,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-foreground/85 hover:bg-card/70 hover:text-foreground",
                )}
              >
                <Icon className="size-[1.125rem]" aria-hidden />
                {item.label}
              </TransitionLink>
            );
          })}
        </nav>
        <div className="mt-auto pt-4">
          <UserMenu user={user} align="start" side="top" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="app-shell-chrome sticky top-0 z-20 border-b border-border bg-background/90 px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2.5 backdrop-blur min-[400px]:px-4 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold leading-tight text-primary min-[400px]:text-lg">
                {APP_NAME}
              </p>
            </div>
            <UserMenu user={user} />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-2 pb-[calc(5.25rem+env(safe-area-inset-bottom))] min-[400px]:px-4 md:px-8 md:py-5 md:pb-10">
          <AppPageTransition>{children}</AppPageTransition>
        </main>

        <nav
          className="app-shell-chrome safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
          aria-label="Mobile"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href} className="min-w-0">
                  <TransitionLink
                    href={item.href}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium leading-tight transition-[color,background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] min-[380px]:text-[11px]",
                      active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-xl transition-colors",
                        active && "bg-primary/12",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </TransitionLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
