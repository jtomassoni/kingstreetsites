"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, LeadStatus } from "@/lib/lead-status";

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

  const chevron =
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2394a3b8%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M6 9l6 6 6-6%27/%3E%3C/svg%3E")';

  return (
    <select
      value={value}
      onChange={(e) => update(e.target.value as LeadStatus)}
      disabled={isPending}
      style={{
        backgroundImage: chevron,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.4rem center",
        backgroundSize: "1rem",
      }}
      className={`lead-status-select appearance-none cursor-pointer font-medium text-slate-100
        rounded-lg border border-white/15 bg-slate-800 shadow-sm
        hover:border-white/25 hover:bg-slate-700
        focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50
        disabled:cursor-not-allowed disabled:opacity-50
        [color-scheme:dark]
        ${compact ? "min-w-[5.5rem] pl-2.5 pr-8 py-1.5 text-xs" : "min-w-[8rem] pl-3 pr-9 py-2 text-sm"}`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LEAD_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
