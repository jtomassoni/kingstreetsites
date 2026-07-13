"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ConversationMessage = {
  id: string;
  direction: "outbound" | "inbound";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  created_at: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function ConversationThread({
  leadId,
  defaultToEmail,
  initialMessages,
}: {
  leadId: string;
  defaultToEmail?: string | null;
  initialMessages: ConversationMessage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState(initialMessages);
  const [to, setTo] = useState(defaultToEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showMeta, setShowMeta] = useState(!defaultToEmail || initialMessages.length === 0);
  const [feedback, setFeedback] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasThread = messages.length > 0;
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (defaultToEmail) setTo(defaultToEmail);
  }, [defaultToEmail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim() || !message.trim()) return;
    if (!hasThread && !subject.trim()) {
      setFeedback("Add a subject for the first email.");
      setShowMeta(true);
      return;
    }

    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: subject.trim() || undefined,
        message,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Email failed to send.");
      return;
    }

    const optimistic: ConversationMessage = {
      id: `local-${Date.now()}`,
      direction: "outbound",
      from_email: null,
      to_email: to,
      subject: subject.trim() || (lastSubject ? (lastSubject.toLowerCase().startsWith("re:") ? lastSubject : `Re: ${lastSubject}`) : null),
      body_text: message,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessage("");
    if (!hasThread) setSubject("");
    setShowMeta(false);
    setFeedback("Sent.");
    startTransition(() => router.refresh());
  }

  let lastDay = "";

  return (
    <div className="flex h-[min(36rem,70vh)] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-slate-900/70 to-slate-950 shadow-2xl shadow-black/40 ring-1 ring-teal-500/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-slate-950/70 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Conversation</h2>
          <p className="text-[11px] text-slate-500">
            {to ? `Email ↔ ${to}` : "Add a recipient to start messaging"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowMeta((v) => !v)}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200"
        >
          {showMeta ? "Hide details" : "To / subject"}
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(45,212,191,0.06),transparent_55%)]"
          aria-hidden
        />
        {messages.length === 0 ? (
          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 ring-1 ring-teal-500/25">
              <span className="text-lg text-teal-300" aria-hidden>
                ✉
              </span>
            </div>
            <p className="text-sm font-medium text-slate-200">No messages yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Send the first email below. Replies will land here as chat bubbles when inbound is wired.
            </p>
          </div>
        ) : (
          <div className="relative space-y-3">
            {messages.map((msg) => {
              const day = dayKey(msg.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const mine = msg.direction === "outbound";
              return (
                <div key={msg.id}>
                  {showDay ? (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-slate-800/90 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 ring-1 ring-white/5">
                        {dayLabel(msg.created_at)}
                      </span>
                    </div>
                  ) : null}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[min(100%,28rem)] ${
                        mine ? "items-end" : "items-start"
                      } flex flex-col gap-1`}
                    >
                      {msg.subject ? (
                        <span
                          className={`px-1 text-[10px] font-medium ${
                            mine ? "text-teal-400/70 text-right" : "text-slate-500"
                          }`}
                        >
                          {msg.subject}
                        </span>
                      ) : null}
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-md ${
                          mine
                            ? "rounded-br-md bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-teal-900/30"
                            : "rounded-bl-md bg-slate-800 text-slate-100 ring-1 ring-white/10"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body_text || "(empty)"}</p>
                      </div>
                      <span className={`px-1 text-[10px] text-slate-600 ${mine ? "text-right" : ""}`}>
                        {formatTime(msg.created_at)}
                        {mine ? " · You" : msg.from_email ? ` · ${msg.from_email}` : " · Them"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={sendEmail}
        className="border-t border-white/[0.07] bg-slate-950/90 px-3 py-3 backdrop-blur sm:px-4"
      >
        {showMeta ? (
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Recipient email"
              type="email"
              required
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={hasThread ? `Subject (optional — last: ${lastSubject || "none"})` : "Subject"}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            />
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="iMessage-style compose — write your email…"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-2xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (to.trim() && message.trim()) {
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }
            }}
          />
          <button
            type="submit"
            disabled={isPending || !to.trim() || !message.trim()}
            className="shrink-0 rounded-full bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/40 transition hover:bg-teal-400 disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-600">
            Enter to send · Shift+Enter for newline
            {hasThread && !showMeta ? " · Follow-ups reuse the last subject" : ""}
          </p>
          {feedback ? <p className="text-[11px] text-slate-400">{feedback}</p> : null}
        </div>
      </form>
    </div>
  );
}
