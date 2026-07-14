"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { crm } from "@/lib/admin-ui";

export function LeadDetailSubNav({ leadId }: { leadId: string }) {
  const pathname = usePathname();
  const onBilling = pathname.endsWith("/billing");

  return (
    <nav className={crm.tabs} aria-label="Lead sections">
      <Link href={`/admin/leads/${leadId}`} className={crm.tab(!onBilling)}>
        Overview
      </Link>
      <Link href={`/admin/leads/${leadId}/billing`} className={crm.tab(onBilling)}>
        Billing
      </Link>
    </nav>
  );
}
