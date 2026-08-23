"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, LeadStatus } from "@/lib/lead-status";

const STATUS_STYLES: Record<
  LeadStatus,
  { bg: string; border: string; text: string; dot: string; hover: string }
> = {
  new: {
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    text: "text-slate-200",
    dot: "bg-slate-400",
    hover: "hover:border-slate-400/45 hover:bg-slate-500/15",
  },
  staged: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-200",
    dot: "bg-sky-400",
    hover: "hover:border-sky-400/45 hover:bg-sky-500/15",
  },
  reached_out: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-200",
    dot: "bg-amber-400",
    hover: "hover:border-amber-400/45 hover:bg-amber-500/15",
  },
  clicked: {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-200",
    dot: "bg-cyan-400",
    hover: "hover:border-cyan-400/45 hover:bg-cyan-500/15",
  },
  replied: {
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    text: "text-teal-200",
    dot: "bg-teal-400",
    hover: "hover:border-teal-400/45 hover:bg-teal-500/15",
  },
  closed_won: {
    bg: "bg-emerald-500/12",
    border: "border-emerald-500/35",
    text: "text-emerald-200",
    dot: "bg-emerald-400",
    hover: "hover:border-emerald-400/50 hover:bg-emerald-500/18",
  },
  closed_lost: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-200",
    dot: "bg-red-400",
    hover: "hover:border-red-400/45 hover:bg-red-500/15",
  },
};

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const styles = STATUS_STYLES[value];

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
    <div className="relative inline-flex">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full ${styles.dot} ${
          compact ? "left-2 size-1.5" : "left-2.5 size-1.5"
        }`}
      />
      <select
        value={value}
        onChange={(e) => update(e.target.value as LeadStatus)}
        disabled={isPending}
        aria-label="Lead status"
        className={`lead-status-select cursor-pointer appearance-none rounded-full border font-medium shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition focus:outline-none focus:ring-2 focus:ring-crm-accent/25 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark] ${styles.bg} ${styles.border} ${styles.text} ${styles.hover} ${
          compact
            ? "min-w-[6.75rem] py-1 pl-6 pr-7 text-xs"
            : "min-w-[9.25rem] py-1.5 pl-7 pr-8 text-sm"
        }`}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-60 ${styles.text} ${
          compact ? "right-2 size-3" : "right-2.5 size-3.5"
        }`}
      />
    </div>
  );
}
