"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function OutreachPanel({
  leadId,
  defaultToEmail,
}: {
  leadId: string;
  defaultToEmail?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [to, setTo] = useState(defaultToEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
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

  async function sendEmail() {
    if (!to.trim() || !subject.trim() || !message.trim()) return;
    const res = await fetch(`/api/leads/${leadId}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, message }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFeedback(data?.error ?? "Email failed to send.");
      return;
    }
    setSubject("");
    setMessage("");
    setFeedback("Email sent.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Add Internal Note</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Add call notes, objections, pricing discussion, next steps..."
          className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={saveNote}
            disabled={isPending}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
          >
            Save Note
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Send Email</h2>
        <div className="space-y-3">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Prospect email"
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Your outreach message..."
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div className="mt-3 flex justify-between items-center">
          <p className="text-xs text-slate-500">Uses RESEND_API_KEY for delivery and logs to timeline.</p>
          <button
            onClick={sendEmail}
            disabled={isPending}
            className="rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
          >
            Send Email
          </button>
        </div>
        {feedback && <p className="text-xs text-slate-400 mt-2">{feedback}</p>}
      </div>
    </div>
  );
}
