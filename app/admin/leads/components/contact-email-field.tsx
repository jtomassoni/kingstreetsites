"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ContactEmailField({
  leadId,
  initialEmail,
}: {
  leadId: string;
  initialEmail?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");

  async function save() {
    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_email: email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not save email.");
      return;
    }
    setFeedback("Saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500 text-sm">Email</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            className="w-full max-w-[11rem] rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 outline-none focus:border-teal-500/40"
          />
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
      {feedback ? <p className="text-right text-[11px] text-slate-500">{feedback}</p> : null}
    </div>
  );
}
