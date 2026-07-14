"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, LeadStatus } from "@/lib/lead-status";
import { crm } from "@/lib/admin-ui";

export default function StatusSelect({
  leadId,
  status,
  compact = false,
}: {
  leadId: string;
  status: LeadStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [isPending, startTransition] = useTransition();

  async function update(next: LeadStatus) {
    setValue(next);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setValue(status);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <select
      value={value}
      onChange={(e) => update(e.target.value as LeadStatus)}
      disabled={isPending}
      className={`lead-status-select cursor-pointer appearance-none rounded-md border border-crm-border bg-crm-raised font-medium text-crm-text transition hover:bg-crm-border/40 focus:border-crm-accent/50 focus:outline-none focus:ring-1 focus:ring-crm-accent/25 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark] ${
        compact ? "min-w-[5.5rem] px-2 py-1 text-xs" : "min-w-[8rem] px-2.5 py-1.5 text-sm"
      }`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LEAD_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
