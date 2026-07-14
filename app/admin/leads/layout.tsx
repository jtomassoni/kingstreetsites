import type { ReactNode } from "react";
import { Suspense } from "react";
import { LeadsSubNavGate } from "./leads-subnav-gate";
import { getPeopleCounts } from "./data";

export default async function LeadsLayout({ children }: { children: ReactNode }) {
  const counts = await getPeopleCounts();

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,92rem)]">
      <Suspense fallback={null}>
        <LeadsSubNavGate counts={counts} />
      </Suspense>
      {children}
    </div>
  );
}
