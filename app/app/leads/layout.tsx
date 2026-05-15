import type { ReactNode } from "react";
import { LeadsSubNav } from "./leads-subnav";

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[min(100%,92rem)]">
      <LeadsSubNav />
      {children}
    </div>
  );
}
