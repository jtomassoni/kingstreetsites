"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  consumeTransitionIntent,
  type TransitionIntent,
} from "@meals/lib/navigation/transition-intent";
import { cn } from "@meals/lib/utils";

export function AppPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [intent, setIntent] = useState<TransitionIntent>("fade");
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    setIntent(consumeTransitionIntent());
  }, [pathname]);

  return (
    <div
      className={cn(
        "app-page-transition",
        `app-page-transition--${intent}`,
      )}
    >
      {children}
    </div>
  );
}
