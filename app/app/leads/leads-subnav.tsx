"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabClass = (active: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
    active
      ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 ring-1 ring-teal-500/35 shadow-sm"
      : "text-slate-400 ring-1 ring-transparent hover:bg-white/5 hover:text-slate-200 hover:ring-white/10"
  }`;

export function LeadsSubNav() {
  const pathname = usePathname();
  const pipeline = pathname === "/app/leads/pipeline";

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3" aria-label="Leads section">
      <Link href="/app/leads" className={tabClass(!pipeline)}>
        All leads
      </Link>
      <Link href="/app/leads/pipeline" className={tabClass(pipeline)}>
        Pipeline
      </Link>
      <p className="ml-auto hidden max-w-md text-xs text-slate-500 sm:block">
        {pipeline
          ? "Scrape and analyze — background jobs that fill the list."
          : "Sort, open records, and manage outreach status."}
      </p>
    </nav>
  );
}
