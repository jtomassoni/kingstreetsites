"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function NotesPanel({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");

  async function saveNote() {
    if (!note.trim()) return;
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      setFeedback("Could not save note.");
      return;
    }
    setNote("");
    setFeedback("Note added.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Internal notes
      </h2>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder="Call notes, objections, pricing, next steps…"
        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        {feedback ? <p className="text-xs text-slate-500">{feedback}</p> : <span />}
        <button
          type="button"
          onClick={saveNote}
          disabled={isPending || !note.trim()}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
        >
          Save note
        </button>
      </div>
    </div>
  );
}
