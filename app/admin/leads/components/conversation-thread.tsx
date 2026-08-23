"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";
import { useToast } from "@/app/admin/components/toast";
import type { LeadSiteIssue } from "@/lib/lead-site-issues";

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

/** Visual timeline blocks — notes/events sit outside email conversation groups. */
type TimelineSegment =
  | {
      type: "conversation";
      key: string;
      messages: ConversationMessage[];
      subject: string | null;
    }
  | { type: "note"; note: ConversationNote }
  | { type: "event"; event: TimelineSystemEvent };

/** Collapse long same-subject runs (Gmail-style “earlier messages”). */
const COLLAPSE_THRESHOLD = 6;

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

/** Gmail-style subject folding: strip repeated Re:/Fwd:/etc. */
function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = subject.trim().toLowerCase().replace(/\s+/g, " ");
  for (;;) {
    const next = s.replace(/^(re|fwd?|fw|aw|sv|antw)\s*:\s*/i, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function displaySubjectLabel(subject: string | null | undefined): string {
  const raw = subject?.trim();
  if (!raw) return "(no subject)";
  const stripped = raw.replace(/^(?:\s*(?:re|fwd?|fw|aw|sv|antw)\s*:\s*)+/i, "").trim();
  return stripped || raw;
}

/** Keep the new reply; drop Gmail/Outlook quote chains so bubbles stay chat-sized. */
function stripQuotedReply(body: string | null | undefined): string {
  if (!body) return "";
  const text = body.replace(/\r\n/g, "\n").replace(/\u202f/g, " ").trim();
  if (!text) return "";

  const patterns = [
    /\n+On .+?wrote:\s*/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nFrom:\s.+\nSent:\s/i,
    /\n_{5,}\n/,
    /\n>+ ?/,
  ];

  let cut = text.length;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.index != null && match.index > 0 && match.index < cut) {
      cut = match.index;
    }
  }

  const cleaned = text.slice(0, cut).replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned) return cleaned;
  const withoutQuotes = text
    .split("\n")
    .filter((line) => !/^\s*>/.test(line) && !/^On .+wrote:\s*$/i.test(line.trim()))
    .join("\n")
    .trim();
  return withoutQuotes || text;
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
    (a, b) => new Date(entryTimestamp(b)).getTime() - new Date(entryTimestamp(a)).getTime()
  );
}

/**
 * Same normalized subject = one conversation (Gmail-style).
 * Empty subjects inherit the previous message’s key so replies stay threaded.
 * Walks oldest→newest so inheritance is correct.
 */
function assignConversationKeys(messages: ConversationMessage[]): Map<string, string> {
  const keys = new Map<string, string>();
  let lastMessageKey = "";

  const chronological = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const message of chronological) {
    const norm = normalizeSubject(message.subject);
    const key = norm || lastMessageKey || `solo:${message.id}`;
    keys.set(message.id, key);
    lastMessageKey = key;
  }
  return keys;
}

/**
 * One card per subject — all emails in that thread stay together.
 * Notes/events sit between conversation cards by time (they no longer split a thread).
 * Skip email_sent / email_received events; bubbles already cover those.
 */
function buildSegments(
  messages: ConversationMessage[],
  notes: ConversationNote[],
  events: TimelineSystemEvent[],
  conversationKeys: Map<string, string>
): TimelineSegment[] {
  const byKey = new Map<string, ConversationMessage[]>();
  for (const message of messages) {
    const key = conversationKeys.get(message.id) ?? `solo:${message.id}`;
    const list = byKey.get(key) ?? [];
    list.push(message);
    byKey.set(key, list);
  }

  const items: { sortAt: number; segment: TimelineSegment }[] = [];

  for (const [key, msgs] of byKey) {
    const chronological = [...msgs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const latest = chronological[chronological.length - 1];
    items.push({
      sortAt: new Date(latest.created_at).getTime(),
      segment: {
        type: "conversation",
        key,
        // Chat order inside the card: oldest → newest
        messages: chronological,
        subject: chronological.find((m) => m.subject)?.subject ?? latest.subject,
      },
    });
  }

  for (const note of notes) {
    items.push({
      sortAt: new Date(note.created_at).getTime(),
      segment: { type: "note", note },
    });
  }

  for (const event of events) {
    if (event.event_type === "email_sent" || event.event_type === "email_received") continue;
    items.push({
      sortAt: new Date(event.created_at).getTime(),
      segment: { type: "event", event },
    });
  }

  // Newest activity first in the feed
  items.sort((a, b) => b.sortAt - a.sortAt);
  return items.map((item) => item.segment);
}

function eventKindLabel(eventType: string) {
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

function replySubject(prior: string): string {
  const trimmed = prior.trim();
  if (!trimmed) return "";
  return /^re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export default function ConversationThread({
  leadId,
  defaultToEmail,
  initialMessages,
  initialNotes,
  initialEvents = [],
  initialSiteIssues = [],
  discoveredAt,
  fillHeight = false,
}: {
  leadId: string;
  defaultToEmail?: string | null;
  initialMessages: ConversationMessage[];
  initialNotes: ConversationNote[];
  initialEvents?: TimelineSystemEvent[];
  initialSiteIssues?: LeadSiteIssue[];
  discoveredAt?: string;
  fillHeight?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [messages, setMessages] = useState(initialMessages);
  const [notes, setNotes] = useState(initialNotes);
  const [events, setEvents] = useState(initialEvents);
  const [composeMode, setComposeMode] = useState<"email" | "note">("email");
  const [to, setTo] = useState(defaultToEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showMeta, setShowMeta] = useState(!defaultToEmail || initialMessages.length === 0);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [syncingInbound, setSyncingInbound] = useState(false);
  const [siteIssues, setSiteIssues] = useState(initialSiteIssues);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(
    () => new Set(initialSiteIssues.map((issue) => issue.id))
  );
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const timeline = useMemo(
    () => buildTimeline(messages, notes, events),
    [messages, notes, events]
  );
  const conversationKeys = useMemo(() => assignConversationKeys(messages), [messages]);
  const segments = useMemo(
    () => buildSegments(messages, notes, events, conversationKeys),
    [messages, notes, events, conversationKeys]
  );

  const conversationSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const message of messages) {
      const key = conversationKeys.get(message.id);
      if (!key) continue;
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    return sizes;
  }, [messages, conversationKeys]);

  /** Message ids hidden when a long same-subject run is collapsed. */
  const hiddenMessageIds = useMemo(() => {
    const hidden = new Set<string>();
    const byKey = new Map<string, ConversationMessage[]>();

    for (const message of messages) {
      const key = conversationKeys.get(message.id);
      if (!key) continue;
      const list = byKey.get(key) ?? [];
      list.push(message);
      byKey.set(key, list);
    }

    for (const [key, msgs] of byKey) {
      if (expandedConversations.has(key) || msgs.length <= COLLAPSE_THRESHOLD) continue;
      // Chronological (oldest→newest): keep the oldest + two newest; hide the middle.
      const chronological = [...msgs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const keep = new Set([
        chronological[0]?.id,
        chronological[chronological.length - 1]?.id,
        chronological[chronological.length - 2]?.id,
      ]);
      for (const msg of chronological) {
        if (!keep.has(msg.id)) hidden.add(msg.id);
      }
    }
    return hidden;
  }, [messages, conversationKeys, expandedConversations]);

  const hasThread = messages.length > 0;
  const lastSubject = [...messages].reverse().find((m) => m.subject)?.subject ?? "";
  const isEmpty = messages.length === 0 && notes.length === 0 && events.length === 0;

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
    setSiteIssues(initialSiteIssues);
    setSelectedIssueIds((prev) => {
      const next = new Set<string>();
      for (const issue of initialSiteIssues) {
        if (prev.has(issue.id)) next.add(issue.id);
      }
      if (next.size === 0 && initialSiteIssues.length > 0) {
        for (const issue of initialSiteIssues) next.add(issue.id);
      }
      return next;
    });
  }, [initialSiteIssues]);

  useEffect(() => {
    if (defaultToEmail) setTo(defaultToEmail);
  }, [defaultToEmail]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (shouldScrollRef.current) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      shouldScrollRef.current = false;
      return;
    }
    el.scrollTop = 0;
  }, [timeline.length]);

  function scrollToLatest() {
    shouldScrollRef.current = true;
  }

  function toggleConversation(key: string) {
    setExpandedConversations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (sendingEmail || !to.trim() || !message.trim()) return;
    if (!hasThread && !subject.trim()) {
      setShowMeta(true);
      toast({
        tone: "error",
        title: "Subject required",
        description: "Add a subject for the first email in the thread.",
      });
      return;
    }

    setSendingEmail(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: subject.trim() || undefined,
          message,
          siteIssueIds: [...selectedIssueIds],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Email failed to send",
          description: data?.error ?? "Something went wrong. Try again.",
        });
        return;
      }

      const optimistic: ConversationMessage = {
        id: `local-${Date.now()}`,
        direction: "outbound",
        from_email: null,
        to_email: to,
        subject: subject.trim() || (lastSubject ? replySubject(lastSubject) : null),
        body_text: message,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setMessage("");
      if (!hasThread) setSubject("");
      setShowMeta(false);
      toast({
        tone: "success",
        title: "Email sent",
        description: `Delivered to ${to.trim()}`,
      });
      scrollToLatest();
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Email failed to send",
        description: "Network error. Check your connection and try again.",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (savingNote || !noteText.trim()) return;

    setSavingNote(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Could not save note",
          description: data?.error ?? "Something went wrong. Try again.",
        });
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
      toast({ tone: "success", title: "Note added" });
      scrollToLatest();
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Could not save note",
        description: "Network error. Check your connection and try again.",
      });
    } finally {
      setSavingNote(false);
    }
  }

  function toggleIssueSelection(issueId: string) {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }

  async function syncInbound() {
    setSyncingInbound(true);
    try {
      const res = await fetch("/api/admin/outreach/sync-inbound", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Could not sync replies",
          description: data?.error ?? "Something went wrong. Try again.",
        });
        return;
      }
      const imported = typeof data.imported === "number" ? data.imported : 0;
      toast({
        tone: imported > 0 ? "success" : "info",
        title: imported > 0 ? `Imported ${imported} reply${imported === 1 ? "" : "ies"}` : "No new replies",
        description:
          imported > 0
            ? "Thread updated from Resend inbox."
            : "Nothing new in Resend receiving.",
      });
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Could not sync replies",
        description: "Network error. Check your connection and try again.",
      });
    } finally {
      setSyncingInbound(false);
    }
  }

  let lastDay = "";

  function takeDayBadge(iso: string, key: string): ReactNode {
    const day = dayKey(iso);
    if (day === lastDay) return null;
    lastDay = day;
    return (
      <div key={key} className="flex justify-center py-1">
        <span className="rounded-full bg-crm-raised/90 px-3 py-1 text-[11px] font-medium text-crm-muted shadow-sm ring-1 ring-crm-border/70">
          {dayLabel(iso)}
        </span>
      </div>
    );
  }

  function renderMessageBubble(
    msg: ConversationMessage,
    opts: { stack: "solo" | "first" | "middle" | "last" } = { stack: "solo" }
  ) {
    const mine = msg.direction === "outbound";
    const body = stripQuotedReply(msg.body_text) || "(empty)";

    // iMessage-style stacking: shared side stays rounder; tip corner tightens.
    const radius = (() => {
      if (mine) {
        if (opts.stack === "first") return "rounded-[1.25rem] rounded-br-md";
        if (opts.stack === "middle") return "rounded-[1.25rem] rounded-r-md";
        if (opts.stack === "last") return "rounded-[1.25rem] rounded-tr-md";
        return "rounded-[1.25rem] rounded-br-[0.35rem]";
      }
      if (opts.stack === "first") return "rounded-[1.25rem] rounded-bl-md";
      if (opts.stack === "middle") return "rounded-[1.25rem] rounded-l-md";
      if (opts.stack === "last") return "rounded-[1.25rem] rounded-tl-md";
      return "rounded-[1.25rem] rounded-bl-[0.35rem]";
    })();

    const showTime = opts.stack === "solo" || opts.stack === "last";

    return (
      <div
        key={msg.id}
        className={`flex w-full flex-col ${mine ? "items-end" : "items-start"} ${
          opts.stack === "middle" || opts.stack === "first" ? "mb-0.5" : "mb-2"
        }`}
      >
        <div
          className={`max-w-[min(92%,20.5rem)] px-3.5 py-2 text-[15px] leading-snug tracking-[-0.01em] ${radius} ${
            mine
              ? "bg-[#0a84ff] text-white shadow-[0_1px_0_rgba(0,0,0,0.15)]"
              : "bg-[#2c2c2e] text-[#f5f5f7] shadow-[0_1px_0_rgba(0,0,0,0.25)]"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{body}</p>
        </div>
        {showTime ? (
          <time
            className={`mt-1 px-1 text-[10px] tabular-nums text-crm-faint/90 ${
              mine ? "text-right" : "text-left"
            }`}
            title={formatTime(msg.created_at)}
          >
            {mine ? "You · " : ""}
            {formatClock(msg.created_at)}
          </time>
        ) : null}
      </div>
    );
  }

  function stackRole(
    messages: ConversationMessage[],
    index: number
  ): "solo" | "first" | "middle" | "last" {
    const cur = messages[index];
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const samePrev = prev && prev.direction === cur.direction;
    const sameNext = next && next.direction === cur.direction;
    if (!samePrev && !sameNext) return "solo";
    if (!samePrev && sameNext) return "first";
    if (samePrev && sameNext) return "middle";
    return "last";
  }

  function renderConversationSegment(
    segment: Extract<TimelineSegment, { type: "conversation" }>
  ) {
    const size = conversationSizes.get(segment.key) ?? segment.messages.length;
    const hiddenInConv = segment.messages.filter((m) => hiddenMessageIds.has(m.id)).length;
    const showExpand = hiddenInConv > 0 && !expandedConversations.has(segment.key);
    const showCollapse =
      expandedConversations.has(segment.key) && size > COLLAPSE_THRESHOLD;

    const dayBadge = takeDayBadge(
      segment.messages[0].created_at,
      `day-conv-${segment.messages[0].id}`
    );

    const visible = segment.messages.filter((m) => !hiddenMessageIds.has(m.id));

    const body: ReactNode[] = [];
    let expandInserted = false;
    for (const msg of segment.messages) {
      if (msg !== segment.messages[0]) {
        const midDay = takeDayBadge(msg.created_at, `day-mid-${msg.id}`);
        if (midDay) body.push(midDay);
      }
      // Chronological: insert “earlier” control at the first hidden (middle) message.
      if (showExpand && !expandInserted && hiddenMessageIds.has(msg.id)) {
        body.push(
          <div key={`expand-${segment.key}`} className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => toggleConversation(segment.key)}
              className="rounded-full bg-crm-raised/80 px-3 py-1 text-xs font-medium text-crm-muted ring-1 ring-crm-border/60 transition hover:text-crm-text"
            >
              Show {hiddenInConv} earlier
            </button>
          </div>
        );
        expandInserted = true;
      }
      if (!hiddenMessageIds.has(msg.id)) {
        const visibleIndex = visible.findIndex((m) => m.id === msg.id);
        body.push(renderMessageBubble(msg, { stack: stackRole(visible, visibleIndex) }));
      }
    }

    return (
      <div key={`conv-${segment.key}`} className="space-y-2">
        {dayBadge}
        <section className="overflow-hidden rounded-2xl border border-crm-border/70 bg-crm-surface/40">
          <header className="flex items-baseline justify-between gap-3 border-b border-crm-border/60 px-3.5 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-crm-faint">
                Conversation
              </p>
              <h3 className="truncate text-sm font-semibold tracking-tight text-crm-text">
                {displaySubjectLabel(segment.subject)}
              </h3>
            </div>
            {size > 1 ? (
              <p className="shrink-0 text-[11px] tabular-nums text-crm-faint">
                {size} message{size === 1 ? "" : "s"}
              </p>
            ) : null}
          </header>

          <div className="space-y-0.5 px-3 py-3 sm:px-4">
            {body}
            {showCollapse ? (
              <div className="flex justify-center py-1">
                <button
                  type="button"
                  onClick={() => toggleConversation(segment.key)}
                  className="rounded-full px-3 py-1 text-xs font-medium text-crm-faint transition hover:text-crm-muted"
                >
                  Collapse thread
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  function renderNote(note: ConversationNote) {
    return (
      <div key={`note-${note.id}`} className="space-y-3">
        {takeDayBadge(note.created_at, `day-note-${note.id}`)}
        <article className="rounded-xl border border-amber-400/25 border-l-[3px] border-l-amber-400/80 bg-amber-500/[0.1] px-3.5 py-3 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
                Internal note
              </p>
              {note.created_by ? (
                <p className="mt-0.5 text-[11px] text-amber-200/70">{note.created_by}</p>
              ) : null}
            </div>
            <time
              className="shrink-0 text-[11px] tabular-nums text-amber-200/55"
              title={formatTime(note.created_at)}
            >
              {formatClock(note.created_at)}
            </time>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-crm-text">{note.note}</p>
        </article>
      </div>
    );
  }

  function renderEvent(event: TimelineSystemEvent) {
    const style = eventStyle(event.event_type);
    const label = eventKindLabel(event.event_type);
    const detail = event.body ? `${event.title} — ${event.body}` : event.title;
    const accent =
      event.event_type.startsWith("invoice") || event.event_type === "payment_recorded"
        ? "border-emerald-400/25 border-l-emerald-400/70 bg-emerald-500/[0.08]"
        : "border-violet-400/20 border-l-violet-400/60 bg-violet-500/[0.07]";

    return (
      <div key={`event-${event.id}`} className="space-y-3">
        {takeDayBadge(event.created_at, `day-event-${event.id}`)}
        <article className={`rounded-xl border border-l-[3px] px-3.5 py-2.5 sm:px-4 ${accent}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={crm.badge(style.badge)}>{label}</span>
              <span className="text-sm text-crm-muted">{detail}</span>
            </div>
            <time
              className="shrink-0 text-[11px] tabular-nums text-crm-faint"
              title={formatTime(event.created_at)}
            >
              {formatClock(event.created_at)}
            </time>
          </div>
        </article>
      </div>
    );
  }

  const itemCount = messages.length + notes.length;
  const lastSubjectLabel = displaySubjectLabel(lastSubject);

  return (
    <div
      className={`${crm.panel} flex flex-col ${fillHeight ? "min-h-[calc(100vh-13rem)]" : "h-[min(36rem,70vh)]"}`}
    >
      <div className={`${crm.panelHeader} flex items-start justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className={crm.panelTitle}>Messages</h2>
          {itemCount > 0 ? <p className={crm.panelHint}>{itemCount} in this thread</p> : null}
        </div>
        <button
          type="button"
          onClick={() => void syncInbound()}
          disabled={syncingInbound}
          className={crm.btnGhost}
          title="Pull recent replies from Resend (useful when the webhook points at production)"
        >
          {syncingInbound ? "Syncing…" : "Sync replies"}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-transparent via-crm-bg/20 to-crm-bg/40 px-4 py-5 sm:px-5"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-crm-text">Start the conversation</p>
            <p className="mt-1 max-w-xs text-sm text-crm-muted">
              Send an email or drop an internal note below.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col space-y-4">
            {segments.map((segment, index) => {
              if (segment.type === "note") return renderNote(segment.note);
              if (segment.type === "event") return renderEvent(segment.event);
              return renderConversationSegment(segment);
            })}

            {discoveredAt ? (
              <p className="pt-1 text-center text-[11px] text-crm-faint">
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
          <button
            type="button"
            onClick={() => setComposeMode("email")}
            disabled={sendingEmail || savingNote}
            className={crm.pill(composeMode === "email")}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setComposeMode("note")}
            disabled={sendingEmail || savingNote}
            className={crm.pill(composeMode === "note")}
          >
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
                      disabled={sendingEmail}
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
                      placeholder={
                        hasThread
                          ? `Optional — continues “${lastSubjectLabel || "none"}”`
                          : "Subject line"
                      }
                      disabled={sendingEmail}
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
                    <span className="text-crm-faint"> · {lastSubjectLabel}</span>
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
                className={crm.textarea}
                disabled={sendingEmail}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendingEmail && to.trim() && message.trim()) {
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }
                }}
              />
            </div>
            {siteIssues.length > 0 ? (
              <div className={crm.field}>
                <div className="flex items-center justify-between gap-2">
                  <label className={crm.fieldLabel}>Include site issues in email</label>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIssueIds((prev) => {
                        if (prev.size === siteIssues.length) return new Set();
                        return new Set(siteIssues.map((issue) => issue.id));
                      });
                    }}
                    className={`${crm.btnGhost} text-xs`}
                  >
                    {selectedIssueIds.size === siteIssues.length ? "Clear all" : "Select all"}
                  </button>
                </div>
                <ul className="space-y-2 rounded-lg border border-crm-border/70 bg-crm-raised/30 p-3">
                  {siteIssues.map((issue, index) => (
                    <li key={issue.id}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIssueIds.has(issue.id)}
                          onChange={() => toggleIssueSelection(issue.id)}
                          disabled={sendingEmail}
                          className="mt-1 size-4 shrink-0 rounded border-crm-border accent-crm-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-crm-text">
                            <span className="font-medium text-crm-faint">{index + 1}.</span>{" "}
                            {issue.description.trim() || "Screenshot (no description)"}
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={issue.image_url}
                            alt=""
                            className="mt-2 max-h-24 w-auto rounded-md border border-crm-border/60"
                          />
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-crm-faint">
                  Selected screenshots appear in the HTML email with captions under &ldquo;Issues we
                  noticed on your current website.&rdquo;
                </p>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-crm-faint">
                {sendingEmail ? "Sending…" : "Enter to send · Shift+Enter for newline"}
              </p>
              <button
                type="submit"
                disabled={sendingEmail || !to.trim() || !message.trim()}
                className={`${crm.btnPrimary} min-w-[7.5rem] gap-2`}
                aria-busy={sendingEmail}
              >
                {sendingEmail ? (
                  <>
                    <span
                      className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
                      aria-hidden
                    />
                    Sending
                  </>
                ) : (
                  "Send email"
                )}
              </button>
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
                className={crm.textarea}
                disabled={savingNote}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-crm-faint">
                {savingNote ? "Saving…" : "Visible only to your team"}
              </p>
              <button
                type="submit"
                disabled={savingNote || !noteText.trim()}
                className={`${crm.btnPrimary} min-w-[7.5rem] gap-2`}
                aria-busy={savingNote}
              >
                {savingNote ? (
                  <>
                    <span
                      className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
                      aria-hidden
                    />
                    Saving
                  </>
                ) : (
                  "Add note"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
