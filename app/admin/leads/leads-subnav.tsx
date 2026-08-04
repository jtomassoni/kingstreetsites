"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { crm } from "@/lib/admin-ui";

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
    <nav className={`${crm.tabs} mb-6`} aria-label="People">
      <Link href="/admin/leads" className={crm.tab(onList && view === "leads")}>
        Leads{counts ? ` (${counts.leads})` : ""}
      </Link>
      <Link href="/admin/leads?view=customers" className={crm.tab(onList && view === "customers")}>
        Customers{counts ? ` (${counts.customers})` : ""}
      </Link>
      <Link href="/admin/leads/pipeline" className={crm.tab(finding)}>
        Find leads
      </Link>
    </nav>
  );
}
