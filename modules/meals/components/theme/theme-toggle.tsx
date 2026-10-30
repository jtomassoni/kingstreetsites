"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  applyTheme,
  persistTheme,
  resolveTheme,
  type Theme,
} from "@meals/lib/theme";
import { cn } from "@meals/lib/utils";

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon-only — for the mobile header */
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = resolveTheme();
    applyTheme(initial);
    setTheme(initial);
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persistTheme(next);
  }

  const label =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!ready}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-xl text-muted-foreground transition-[color,background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-card/80 hover:text-foreground active:scale-[0.97] disabled:opacity-60",
        compact ? "size-9" : "min-h-11 gap-2.5 px-3 text-sm font-medium",
        className,
      )}
    >
      {theme === "dark" ? (
        <Sun className="size-5 shrink-0" aria-hidden />
      ) : (
        <Moon className="size-5 shrink-0" aria-hidden />
      )}
      {compact ? null : (
        <span>{theme === "dark" ? "Light" : "Dark"}</span>
      )}
    </button>
  );
}
