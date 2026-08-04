"use client";

import { useState } from "react";

export type ActivityEvent = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  source: string;
};

const PREVIEW = 8;

export default function ActivityLog({
  events,
  discoveredAt,
  updatedAt,
}: {
  events: ActivityEvent[];
  discoveredAt: string;
  updatedAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? events : events.slice(0, PREVIEW);
  const remaining = Math.max(0, events.length - PREVIEW);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Activity
          </h2>
          <p className="mt-1 text-[10px] text-slate-600">
            Discovered {new Date(discoveredAt).toLocaleDateString()} · Last updated{" "}
            {new Date(updatedAt).toLocaleDateString()}
            {events.length > 0 ? ` · ${events.length} event${events.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-slate-500">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          {events.length === 0 ? (
            <p className="text-[11px] text-slate-500">No status changes or notes yet.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {visible.map((event) => (
                  <li
                    key={`${event.source}-${event.id}`}
                    className="rounded-md border border-white/[0.07] px-2.5 py-2"
                  >
                    <div className="flex justify-between gap-2 text-[10px] leading-snug">
                      <span className="font-medium text-slate-400">{event.title}</span>
                      <span className="shrink-0 text-slate-600">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    {event.body ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-slate-500">
                        {event.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {remaining > 0 && !showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-1 text-[11px] font-medium text-teal-400/90 hover:text-teal-300"
                >
                  {`Show more (${remaining})`}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
