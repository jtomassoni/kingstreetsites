"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabClass = (active: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
    active
      ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 ring-1 ring-teal-500/35 shadow-sm"
      : "text-slate-400 ring-1 ring-transparent hover:bg-white/5 hover:text-slate-200 hover:ring-white/10"
  }`;

export function LeadsSubNav({
  counts,
}: {
  counts?: { leads: number; customers: number };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const finding = pathname === "/admin/leads/pipeline";
  const view = searchParams.get("view") === "customers" ? "customers" : "leads";
  const onList = pathname === "/admin/leads";

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3" aria-label="People">
      <Link href="/admin/leads" className={tabClass(onList && view === "leads")}>
        Leads
        {counts ? (
          <span className="ml-1.5 tabular-nums text-[11px] opacity-70">{counts.leads}</span>
        ) : null}
      </Link>
      <Link href="/admin/leads?view=customers" className={tabClass(onList && view === "customers")}>
        Customers
        {counts ? (
          <span className="ml-1.5 tabular-nums text-[11px] opacity-70">{counts.customers}</span>
        ) : null}
      </Link>
      <Link href="/admin/leads/pipeline" className={tabClass(finding)}>
        Find leads
      </Link>
      <p className="ml-auto hidden max-w-sm text-xs text-slate-500 sm:block">
        {finding
          ? "Scrape to fill the lead side of this list."
            : view === "customers"
            ? "Closed-won accounts — billing and ongoing relationship."
            : "Worst sites first — affordable rebuilds, then hourly updates."}
      </p>
    </nav>
  );
}
