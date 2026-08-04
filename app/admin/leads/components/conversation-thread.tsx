"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";

export type ConversationMessage = {
  id: string;
  direction: "outbound" | "inbound";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  created_at: string;
};

export type ConversationNote = {
  id: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type TimelineSystemEvent = {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  created_at: string;
};

type TimelineEntry =
  | { type: "message"; message: ConversationMessage }
  | { type: "note"; note: ConversationNote }
  | { type: "event"; event: TimelineSystemEvent };

type ThreadBlock = {
  type: "thread";
  blockId: string;
  threadKey: string;
  displaySubject: string;
  entries: TimelineEntry[];
};

type NoteBlock = {
  type: "note";
  note: ConversationNote;
};

type EventBlock = {
  type: "event";
  event: TimelineSystemEvent;
};

type RenderBlock = ThreadBlock | NoteBlock | EventBlock;

const COLLAPSE_THRESHOLD = 4;

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatTime(iso);
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

function normalizeSubject(subject: string | null): string {
  if (!subject) return "";
  let s = subject.trim().toLowerCase();
  while (s.startsWith("re:")) s = s.slice(3).trim();
  while (s.startsWith("fwd:") || s.startsWith("fw:")) s = s.slice(s.indexOf(":") + 1).trim();
  return s;
}

function threadKey(message: ConversationMessage): string {
  const norm = normalizeSubject(message.subject);
  return norm || `solo:${message.id}`;
}

function entryTimestamp(entry: TimelineEntry): string {
  if (entry.type === "message") return entry.message.created_at;
  if (entry.type === "note") return entry.note.created_at;
  return entry.event.created_at;
}

function buildTimeline(
  messages: ConversationMessage[],
  notes: ConversationNote[],
  events: TimelineSystemEvent[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map((message) => ({ type: "message" as const, message })),
    ...notes.map((note) => ({ type: "note" as const, note })),
    ...events.map((event) => ({ type: "event" as const, event })),
  ];
  return entries.sort(
    (a, b) => new Date(entryTimestamp(a)).getTime() - new Date(entryTimestamp(b)).getTime()
  );
}

function buildRenderBlocks(timeline: TimelineEntry[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  let currentThread: {
    blockId: string;
    threadKey: string;
    displaySubject: string;
    entries: TimelineEntry[];
  } | null = null;

  for (const entry of timeline) {
    if (entry.type === "note") {
      if (currentThread) {
        currentThread.entries.push(entry);
      } else {
        blocks.push({ type: "note", note: entry.note });
      }
      continue;
    }

    if (entry.type === "event") {
      if (currentThread) {
        blocks.push({
          type: "thread",
          blockId: currentThread.blockId,
          threadKey: currentThread.threadKey,
          displaySubject: currentThread.displaySubject,
          entries: currentThread.entries,
        });
        currentThread = null;
      }
      blocks.push({ type: "event", event: entry.event });
      continue;
    }

    const key = threadKey(entry.message);
    const displaySubject = entry.message.subject?.trim() || "(no subject)";

    if (currentThread && currentThread.threadKey === key) {
      currentThread.entries.push(entry);
    } else {
      if (currentThread) {
        blocks.push({
          type: "thread",
          blockId: currentThread.blockId,
          threadKey: currentThread.threadKey,
          displaySubject: currentThread.displaySubject,
          entries: currentThread.entries,
        });
      }
      currentThread = {
        blockId: `thread-${entry.message.id}`,
        threadKey: key,
        displaySubject,
        entries: [entry],
      };
    }
  }

  if (currentThread) {
    blocks.push({
      type: "thread",
      blockId: currentThread.blockId,
      threadKey: currentThread.threadKey,
      displaySubject: currentThread.displaySubject,
      entries: currentThread.entries,
    });
  }
  return blocks;
}

function blockLatestTimestamp(block: RenderBlock): string {
  if (block.type === "note") return block.note.created_at;
  if (block.type === "event") return block.event.created_at;
  return block.entries.reduce((latest, entry) => {
    const ts = entryTimestamp(entry);
    return new Date(ts).getTime() > new Date(latest).getTime() ? ts : latest;
  }, entryTimestamp(block.entries[0]));
}

function messageCount(entries: TimelineEntry[]): number {
  return entries.filter((e) => e.type === "message").length;
}

function eventKindLabel(eventType: string): string {
  if (eventType === "status_changed") return "Status";
  if (eventType === "lead_created") return "Lead";
  if (eventType.startsWith("invoice")) return "Invoice";
  if (eventType === "payment_recorded") return "Payment";
  return "Activity";
}

function eventStyle(eventType: string) {
  if (eventType.startsWith("invoice") || eventType === "payment_recorded") {
    return { badge: "good" as const };
  }
  if (eventType === "status_changed") return { badge: "neutral" as const };
  return { badge: "neutral" as const };
}

function collapseThreadEntries(
  entries: TimelineEntry[],
  expanded: boolean
): { entries: TimelineEntry[]; hiddenCount: number } {
  const msgs = entries.filter((e) => e.type === "message");
  if (expanded || msgs.length <= COLLAPSE_THRESHOLD) {
    return { entries, hiddenCount: 0 };
  }

  const keepFrom = msgs.length - 2;
  const firstVisibleMsgId = msgs[keepFrom]?.type === "message" ? msgs[keepFrom].message.id : null;
  if (!firstVisibleMsgId) return { entries, hiddenCount: 0 };

  let seenFirstVisible = false;
  const visible: TimelineEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.id === firstVisibleMsgId) {
      seenFirstVisible = true;
    }
    if (seenFirstVisible) visible.push(entry);
  }

  return { entries: visible, hiddenCount: msgs.length - 2 };
}

export default function ConversationThread({
  leadId,
  defaultToEmail,
  initialMessages,
  initialNotes,
  initialEvents = [],
  discoveredAt,
  fillHeight = false,
}: {
  leadId: string;
  defaultToEmail?: string | null;
  initialMessages: ConversationMessage[];
  initialNotes: ConversationNote[];
  initialEvents?: TimelineSystemEvent[];
  discoveredAt?: string;
  fillHeight?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState(initialMessages);
  const [notes, setNotes] = useState(initialNotes);
  const [events, setEvents] = useState(initialEvents);
  const [composeMode, setComposeMode] = useState<"email" | "note">("email");
  const [to, setTo] = useState(defaultToEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showMeta, setShowMeta] = useState(!defaultToEmail || initialMessages.length === 0);
  const [feedback, setFeedback] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const timeline = useMemo(
    () => buildTimeline(messages, notes, events),
    [messages, notes, events]
  );
  const blocks = useMemo(() => buildRenderBlocks(timeline), [timeline]);
  const displayBlocks = useMemo(
    () =>
      [...blocks].sort(
        (a, b) => new Date(blockLatestTimestamp(b)).getTime() - new Date(blockLatestTimestamp(a)).getTime()
      ),
    [blocks]
  );
  const hasThread = messages.length > 0;
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";
  const isEmpty = timeline.length === 0;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    if (defaultToEmail) setTo(defaultToEmail);
  }, [defaultToEmail]);

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    shouldScrollRef.current = false;
  }, [timeline.length]);

  function scrollToTop() {
    shouldScrollRef.current = true;
  }

  function toggleThread(blockId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

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
      subject:
        subject.trim() ||
        (lastSubject
          ? lastSubject.toLowerCase().startsWith("re:")
            ? lastSubject
            : `Re: ${lastSubject}`
          : null),
      body_text: message,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessage("");
    if (!hasThread) setSubject("");
    setShowMeta(false);
    setFeedback("Sent.");
    scrollToTop();
    startTransition(() => router.refresh());
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;

    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not save note.");
      return;
    }

    const optimistic: ConversationNote = data.note ?? {
      id: `local-${Date.now()}`,
      note: noteText,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, optimistic]);
    setNoteText("");
    setFeedback("Note added.");
    scrollToTop();
    startTransition(() => router.refresh());
  }

  let lastDay = "";

  function TimeColumn({ iso, className = "" }: { iso: string; className?: string }) {
    return (
      <time
        className={`hidden w-[4.25rem] shrink-0 pt-0.5 text-right text-xs tabular-nums text-crm-faint sm:block ${className}`}
        title={formatTime(iso)}
      >
        {formatClock(iso)}
      </time>
    );
  }

  function MobileTime({ iso }: { iso: string }) {
    return (
      <time className="text-xs tabular-nums text-crm-faint sm:hidden" title={formatTime(iso)}>
        {formatClock(iso)}
      </time>
    );
  }

  function renderNote(note: ConversationNote, inline = false) {
    if (inline) {
      return (
        <div key={`note-${note.id}`} className="border-t border-crm-border px-4 py-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={crm.badge("warn")}>Note</span>
            <time className="text-xs tabular-nums text-crm-faint" title={formatTime(note.created_at)}>
              {formatClock(note.created_at)}
            </time>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-crm-text">{note.note}</p>
        </div>
      );
    }

    return (
      <div key={`note-${note.id}`} className="flex gap-3 sm:gap-4">
        <TimeColumn iso={note.created_at} />
        <article className="min-w-0 flex-1 rounded-lg border border-amber-500/25 bg-amber-500/[0.06]">
          <header className="flex items-center justify-between gap-3 border-b border-amber-500/20 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={crm.badge("warn")}>Internal note</span>
              <MobileTime iso={note.created_at} />
            </div>
            {note.created_by ? <span className="text-xs text-crm-faint">{note.created_by}</span> : null}
          </header>
          <div className="px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-crm-text">{note.note}</p>
          </div>
        </article>
      </div>
    );
  }

  function renderMessageBody(msg: ConversationMessage) {
    const mine = msg.direction === "outbound";
    return (
      <>
        <p className="mb-2 text-xs text-crm-faint">
          {mine ? `To ${msg.to_email ?? "—"}` : `From ${msg.from_email ?? "—"}`}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-crm-text">{msg.body_text || "(empty)"}</p>
      </>
    );
  }

  function renderMessageInThread(msg: ConversationMessage) {
    const mine = msg.direction === "outbound";
    return (
      <div key={msg.id} className="border-t border-crm-border px-4 py-3 first:border-t-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-crm-muted">
            {mine ? "You sent" : msg.from_email || "They replied"}
          </span>
          <time className="text-xs tabular-nums text-crm-faint" title={formatTime(msg.created_at)}>
            {formatClock(msg.created_at)}
          </time>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-crm-text">{msg.body_text || "(empty)"}</p>
      </div>
    );
  }

  function renderEmailCard(msg: ConversationMessage) {
    const mine = msg.direction === "outbound";
    const subject = msg.subject?.trim() || "(no subject)";

    return (
      <div key={msg.id} className="flex gap-3 sm:gap-4">
        <TimeColumn iso={msg.created_at} />
        <article className="min-w-0 flex-1 overflow-hidden rounded-lg border border-crm-border bg-crm-raised">
          <header className="flex items-start justify-between gap-3 border-b border-crm-border bg-crm-surface px-4 py-2.5">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={crm.badge(mine ? "neutral" : "good")}>{mine ? "Email sent" : "Email received"}</span>
                <MobileTime iso={msg.created_at} />
              </div>
              <h3 className="text-sm font-medium leading-snug text-crm-text">{subject}</h3>
            </div>
          </header>
          <div className="px-4 py-3">{renderMessageBody(msg)}</div>
        </article>
      </div>
    );
  }

  function renderEvent(event: TimelineSystemEvent) {
    const style = eventStyle(event.event_type);
    const label = eventKindLabel(event.event_type);
    const detail = event.body ? event.body : event.title;
    const headline = event.body ? event.title : null;

    return (
      <div key={`event-${event.id}`} className="flex gap-3 sm:gap-4">
        <TimeColumn iso={event.created_at} className="pt-1" />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className={crm.badge(style.badge)}>{label}</span>
            <MobileTime iso={event.created_at} />
            {headline ? <span className="font-medium text-crm-text">{headline}</span> : null}
            <span className="text-crm-muted">{detail}</span>
          </div>
        </div>
      </div>
    );
  }

  function renderThreadBlock(block: ThreadBlock) {
    const expanded = expandedThreads.has(block.blockId);
    const totalMsgs = messageCount(block.entries);
    const { entries: visibleEntries, hiddenCount } = collapseThreadEntries(block.entries, expanded);
    const firstMsg = block.entries.find((e) => e.type === "message");
    const latestMsg = [...block.entries].reverse().find((e) => e.type === "message");
    const threadTime =
      latestMsg?.type === "message" ? latestMsg.message.created_at : blockLatestTimestamp(block);
    const orderedEntries = [...visibleEntries].reverse();

    if (totalMsgs === 1 && firstMsg?.type === "message" && !block.entries.some((e) => e.type === "note")) {
      return renderEmailCard(firstMsg.message);
    }

    return (
      <div className="flex gap-3 sm:gap-4">
        <TimeColumn iso={threadTime} />
        <article className="min-w-0 flex-1 overflow-hidden rounded-lg border border-crm-border bg-crm-raised">
          <header className="flex items-start justify-between gap-3 border-b border-crm-border bg-crm-surface px-4 py-2.5">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={crm.badge("neutral")}>Email thread</span>
                <MobileTime iso={threadTime} />
                {totalMsgs > 1 ? (
                  <span className="text-xs text-crm-faint">{totalMsgs} messages</span>
                ) : null}
              </div>
              <h3 className="truncate text-sm font-medium text-crm-text">{block.displaySubject}</h3>
            </div>
          </header>
          <div>
            {orderedEntries.map((entry) =>
              entry.type === "note"
                ? renderNote(entry.note, true)
                : entry.type === "message"
                  ? renderMessageInThread(entry.message)
                  : null
            )}
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => toggleThread(block.blockId)}
                className="w-full border-t border-dashed border-crm-border py-2 text-xs font-medium text-crm-muted transition hover:bg-crm-surface hover:text-crm-text"
              >
                Show {hiddenCount} earlier message{hiddenCount === 1 ? "" : "s"}
              </button>
            ) : null}
            {expanded && totalMsgs > COLLAPSE_THRESHOLD ? (
              <button
                type="button"
                onClick={() => toggleThread(block.blockId)}
                className="w-full border-t border-crm-border py-2 text-xs font-medium text-crm-faint hover:text-crm-muted"
              >
                Collapse thread
              </button>
            ) : null}
          </div>
        </article>
      </div>
    );
  }

  const itemCount = timeline.length;

  return (
    <div
      className={`${crm.panel} flex flex-col ${fillHeight ? "min-h-[calc(100vh-13rem)]" : "h-[min(36rem,70vh)]"}`}
    >
      <div className={crm.panelHeader}>
        <div className="min-w-0">
          <h2 className={crm.panelTitle}>Conversation</h2>
          {itemCount > 0 ? <p className={crm.panelHint}>{itemCount} events</p> : null}
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-crm-text">No activity yet</p>
            <p className="mt-1 max-w-xs text-sm text-crm-muted">
              Send an email or add an internal note below.
            </p>
          </div>
        ) : (
          <div className="relative space-y-4">
            <div ref={topRef} className="h-1" />
            <div className="space-y-4">
              {displayBlocks.map((block) => {
                const ts = blockLatestTimestamp(block);
                const day = dayKey(ts);
                const showDay = day !== lastDay;
                lastDay = day;

                return (
                  <div
                    key={
                      block.type === "note"
                        ? `note-block-${block.note.id}`
                        : block.type === "event"
                          ? `event-block-${block.event.id}`
                          : block.blockId
                    }
                  >
                    {showDay ? (
                      <div className="mb-3 flex items-center gap-3">
                        <span className="shrink-0 rounded-md bg-crm-raised px-2.5 py-1 text-xs font-medium text-crm-text">
                          {dayLabel(ts)}
                        </span>
                        <div className="h-px flex-1 bg-crm-border" aria-hidden />
                      </div>
                    ) : null}

                    {block.type === "note"
                      ? renderNote(block.note)
                      : block.type === "event"
                        ? renderEvent(block.event)
                        : renderThreadBlock(block)}
                  </div>
                );
              })}
            </div>
            {discoveredAt ? (
              <p className="pt-2 text-xs text-crm-faint">
                Lead since{" "}
                {new Date(discoveredAt).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className={`${crm.panelHeader} mt-auto space-y-3`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setComposeMode("email")} className={crm.pill(composeMode === "email")}>
            Email
          </button>
          <button type="button" onClick={() => setComposeMode("note")} className={crm.pill(composeMode === "note")}>
            Note
          </button>
        </div>

        {composeMode === "email" ? (
          <form onSubmit={sendEmail} className="space-y-3">
            {showMeta ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={crm.fieldLabel}>To & subject</span>
                  {hasThread && to.trim() ? (
                    <button type="button" onClick={() => setShowMeta(false)} className={`${crm.btnGhost} text-xs`}>
                      Hide
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={crm.field}>
                    <label className={crm.fieldLabel} htmlFor={`compose-to-${leadId}`}>
                      To
                    </label>
                    <input
                      id={`compose-to-${leadId}`}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="Recipient email"
                      type="email"
                      required
                      className={crm.input}
                    />
                  </div>
                  <div className={crm.field}>
                    <label className={crm.fieldLabel} htmlFor={`compose-subject-${leadId}`}>
                      Subject
                    </label>
                    <input
                      id={`compose-subject-${leadId}`}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={hasThread ? `Optional — last: ${lastSubject || "none"}` : "Subject line"}
                      className={crm.input}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <p className="min-w-0 text-crm-muted">
                  To{" "}
                  <span className="font-medium text-crm-text">{to.trim() || "—"}</span>
                  {hasThread && lastSubject ? (
                    <span className="text-crm-faint"> · {lastSubject}</span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => setShowMeta(true)}
                  className={`${crm.btnGhost} shrink-0 text-xs`}
                >
                  Change to & subject
                </button>
              </div>
            )}
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Write your email…"
                className={`${crm.input} min-h-[5rem] resize-y`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (to.trim() && message.trim()) {
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-crm-faint">Enter to send · Shift+Enter for newline</p>
              <div className="flex items-center gap-3">
                {feedback && composeMode === "email" ? (
                  <span className="text-xs text-crm-muted">{feedback}</span>
                ) : null}
                <button
                  type="submit"
                  disabled={isPending || !to.trim() || !message.trim()}
                  className={crm.btnPrimary}
                >
                  Send email
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={saveNote} className="space-y-3">
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Internal note</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Call notes, objections, pricing — team only…"
                className={`${crm.input} min-h-[5rem] resize-y`}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-crm-faint">Visible only to your team</p>
              <div className="flex items-center gap-3">
                {feedback && composeMode === "note" ? (
                  <span className="text-xs text-crm-muted">{feedback}</span>
                ) : null}
                <button type="submit" disabled={isPending || !noteText.trim()} className={crm.btnPrimary}>
                  Add note
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
