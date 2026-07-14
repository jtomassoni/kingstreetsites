"use client";

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PipelineSummary } from "./pipeline-stats-strip";
import { crm } from "@/lib/admin-ui";

const METRO_ZIPS: Record<string, { zip: string; metro: string }> = {
  "Denver - All configured ZIPs": { zip: "ALL", metro: "Denver" },
  "Baltimore - All configured ZIPs": { zip: "ALL", metro: "Baltimore" },
  "Denver - Highland (80211)": { zip: "80211", metro: "Denver" },
  "Denver - LoDo (80202)": { zip: "80202", metro: "Denver" },
  "Denver - RiNo (80205)": { zip: "80205", metro: "Denver" },
  "Baltimore - Fells Point (21231)": { zip: "21231", metro: "Baltimore" },
  "Baltimore - Canton (21224)": { zip: "21224", metro: "Baltimore" },
  "Baltimore - Federal Hill (21230)": { zip: "21230", metro: "Baltimore" },
  "Baltimore - Hampden (21211)": { zip: "21211", metro: "Baltimore" },
};

type RunStatus = {
  id: string;
  zip: string;
  metro: string;
  status: "running" | "complete" | "failed";
  total: number;
  processed: number;
  inserted: number;
  current_business: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  events?: Array<{
    action: string;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>;
};

function pct(run: RunStatus) {
  if (!run.total) return 0;
  return Math.min(100, Math.round((run.processed / run.total) * 100));
}

function eta(run: RunStatus): string {
  if (!run.total || !run.processed) return "estimating…";
  const elapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  const rate = run.processed / elapsed;
  const remaining = (run.total - run.processed) / rate;
  if (remaining < 60) return `~${Math.round(remaining)}s left`;
  return `~${Math.round(remaining / 60)}m left`;
}

function rate(run: RunStatus): string {
  if (!run.processed) return "warming up";
  const elapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  if (elapsed <= 0) return "warming up";
  const perMin = (run.processed / elapsed) * 60;
  return `${perMin.toFixed(1)}/min`;
}

function actionLabel(action: string): string {
  if (action === "prospector_run_start") return "Run started";
  if (action === "prospector_batch_start") return "Batch started";
  if (action === "prospector_batch_complete") return "Batch complete";
  if (action === "prospector_run_complete") return "Run complete";
  return action.replaceAll("_", " ");
}

function runPhase(run: RunStatus): string {
  if (run.status === "failed") return "failed";
  if (run.status === "complete") return "complete";
  const text = (run.current_business ?? "").toLowerCase();
  if (text.includes("writing leads")) return "writing";
  if (text.includes("batch")) return "batching";
  if (run.processed === 0) return "warming";
  return "processing";
}

function phaseLabel(phase: string): string {
  if (phase === "warming") return "Warming up";
  if (phase === "batching") return "Running batches";
  if (phase === "processing") return "Processing leads";
  if (phase === "writing") return "Writing results";
  if (phase === "complete") return "Complete";
  if (phase === "failed") return "Failed";
  return "Running";
}

function phaseStepIndex(phase: string): number {
  if (phase === "warming") return 0;
  if (phase === "batching" || phase === "processing") return 1;
  if (phase === "writing" || phase === "complete") return 2;
  return 0;
}

function payloadNum(payload: Record<string, unknown> | null, key: string): number | null {
  if (!payload) return null;
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function PhaseStrip({ activeIndex, variant }: { activeIndex: number; variant: "teal" | "violet" }) {
  const labels = ["Connect", "Pull", "Save"];
  const active =
    variant === "teal"
      ? "border-teal-500/35 bg-teal-500/10 text-teal-100"
      : "border-violet-500/35 bg-violet-500/10 text-violet-100";
  const muted = "border-crm-border bg-crm-raised text-crm-faint";
  return (
    <div className="mb-2 grid grid-cols-3 gap-1">
      {labels.map((label, i) => (
        <div
          key={label}
          className={`rounded-md border px-1 py-1 text-center text-[8px] font-bold uppercase tracking-wide sm:rounded-lg sm:px-1.5 sm:py-1.5 sm:text-[9px] ${
            i <= activeIndex ? active : muted
          }`}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function IndeterminateBar({ colors }: { colors: string }) {
  return (
    <div className="relative mb-2 h-2 overflow-hidden rounded-full bg-crm-bg ring-1 ring-white/10 sm:mb-2.5 sm:h-2.5">
      <div
        className={`absolute inset-y-0 left-0 w-[42%] rounded-full bg-gradient-to-r ${colors} animate-pipeline-indeterminate opacity-90 shadow-[0_0_12px_rgba(45,212,171,0.35)]`}
      />
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

function scrapeCompleteCopy(run: RunStatus): { headline: string; detail: string; strong: boolean } {
  if (run.inserted > 0) {
    return {
      headline: `${run.inserted.toLocaleString()} new or updated row${run.inserted === 1 ? "" : "s"}`,
      detail:
        "Places data is in the lead pool with analysis pending. Run Analyze here, then work outreach in Lead pool.",
      strong: true,
    };
  }
  if (run.processed > 0) {
    return {
      headline: "Scrape finished — no new rows",
      detail:
        "Google returned nothing new to insert for this area (or everything was already up to date). Try another ZIP or run again later.",
      strong: false,
    };
  }
  return {
    headline: "Nothing to import",
    detail: "No Places batches ran or the worker exited early. Check agents/prospector/worker.log if this was unexpected.",
    strong: false,
  };
}

function ProspectorActivityFooter({ run }: { run: RunStatus }) {
  if (!run.events?.length) return null;
  return (
    <div className="mt-2 max-h-[5.5rem] overflow-y-auto rounded-lg border border-crm-border bg-crm-bg/50 p-2 ring-1 ring-inset ring-white/[0.04] sm:mt-3 sm:max-h-28 sm:rounded-xl sm:p-3">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-crm-faint sm:mb-2 sm:text-[10px]">Recent activity</p>
      <ul className="space-y-1 text-[10px] text-crm-muted sm:space-y-1.5 sm:text-[11px]">
        {run.events.slice(0, 4).map((event, idx) => (
          <li key={`${event.action}-${event.created_at}-${idx}`} className="flex justify-between gap-2">
            <span className="truncate">{actionLabel(event.action)}</span>
            <span className="shrink-0 text-crm-faint">
              {new Date(event.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONFIGURE_SHELL = crm.toolCard;
const CONTROL_CLASS = `${crm.input} h-10 [color-scheme:dark]`;

export default function ProspectorButton({ pipeline }: { pipeline: PipelineSummary }) {
  const router = useRouter();
  const areaFieldId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("Denver - All configured ZIPs");
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<RunStatus | null>(null);
  const [activeEvent, setActiveEvent] = useState<string | null>(null);

  const fetchRun = useCallback(async (id: string) => {
    const res = await fetch(`/api/prospector/${id}`);
    if (!res.ok) {
      setRun(null);
      return;
    }
    const data: RunStatus = await res.json();
    setRun(data);
    if (data.status !== "running") {
      if (data.status === "complete") router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = setInterval(() => fetchRun(run.id), 2000);
    return () => clearInterval(id);
  }, [run, fetchRun]);

  async function startRun() {
    setStarting(true);
    const { zip, metro } = METRO_ZIPS[selected];
    const res = await fetch("/api/prospector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, metro }),
    });
    const data = await res.json();
    if (res.ok && data.runId) {
      await fetchRun(data.runId);
    }
    setStarting(false);
    if (res.ok) setOpen(false);
  }

  if (run) {
    if (run.status === "complete") {
      const copy = scrapeCompleteCopy(run);
      const success = copy.strong;
      return (
        <div
          className={`flex min-h-0 w-full flex-col rounded-2xl border p-3 shadow-lg ring-1 sm:p-4 ${
            success
              ? "border-teal-500/35 bg-gradient-to-br from-teal-950/45 via-slate-900/80 to-slate-950 ring-teal-500/15"
              : "border-amber-500/25 bg-gradient-to-br from-amber-950/25 via-slate-900/80 to-slate-950 ring-amber-500/10"
          }`}
        >
          <div className="mb-2 grid grid-cols-3 gap-1 sm:mb-3 sm:gap-1.5">
            {(["Connect", "Pull", "Save"] as const).map((label) => (
              <div
                key={label}
                className={`rounded-md border px-1 py-1.5 text-center text-[8px] font-bold uppercase tracking-wide sm:rounded-lg sm:px-1.5 sm:py-2 sm:text-[9px] ${
                  success
                    ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                }`}
              >
                ✓ {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="flex min-w-0 gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-12 sm:w-12 sm:rounded-2xl ${
                  success
                    ? "bg-teal-500/20 text-teal-200 ring-teal-400/30"
                    : "bg-amber-500/15 text-amber-200 ring-amber-400/25"
                }`}
              >
                {success ? <CheckIcon className="h-6 w-6 sm:h-7 sm:w-7" /> : <InfoIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-crm-faint sm:text-[10px] sm:tracking-[0.2em]">
                  Scrape — {run.metro} {run.zip}
                </p>
                <h3 className={`mt-0.5 text-base font-bold leading-snug sm:mt-1 sm:text-lg ${success ? "text-crm-text" : "text-crm-text"}`}>
                  {copy.headline}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-crm-muted sm:mt-1.5 sm:text-sm sm:leading-relaxed">{copy.detail}</p>
                {run.total > 0 ? (
                  <p className="mt-1.5 font-mono text-[10px] text-crm-faint sm:mt-2 sm:text-xs">
                    Run scope: {run.processed.toLocaleString()} / {run.total.toLocaleString()} checked ·{" "}
                    {run.inserted.toLocaleString()} inserted
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRun(null)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:self-start ${
                success
                  ? "bg-gradient-to-b from-teal-500 to-teal-600 text-crm-text shadow-md shadow-teal-950/40 hover:from-teal-400 hover:to-teal-500"
                  : "border border-crm-border bg-crm-raised text-crm-text hover:border-white/25 hover:bg-slate-700"
              }`}
            >
              Dismiss
            </button>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-crm-bg/80 ring-1 ring-white/10 sm:mt-3 sm:h-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                success
                  ? "w-full bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400"
                  : "w-full bg-gradient-to-r from-amber-600/80 via-amber-500/60 to-slate-600/50"
              }`}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
            <Link
              href="/admin/leads/pipeline"
              className="inline-flex items-center justify-center rounded-lg border border-crm-border bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-crm-text transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-crm-text sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
            >
              Run Analyze
            </Link>
            <Link
              href="/admin/leads"
              className="inline-flex items-center justify-center rounded-lg border border-crm-border bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-crm-muted transition hover:border-white/25 hover:text-crm-text sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
            >
              Open lead pool
            </Link>
          </div>

          <ProspectorActivityFooter run={run} />
        </div>
      );
    }

    if (run.status === "failed") {
      return (
        <div className="flex min-h-0 w-full flex-col rounded-2xl border border-red-500/35 bg-gradient-to-br from-red-950/45 via-slate-900/90 to-slate-950 p-3 shadow-lg ring-1 ring-red-500/15 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-200 ring-1 ring-red-400/35 sm:h-12 sm:w-12 sm:rounded-2xl">
                <span className="text-xl font-bold leading-none sm:text-2xl" aria-hidden>
                  !
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-red-300/80 sm:text-[10px] sm:tracking-[0.2em]">
                  Scrape — {run.metro} {run.zip}
                </p>
                <h3 className="mt-0.5 text-base font-bold text-crm-text sm:mt-1 sm:text-lg">Run failed</h3>
                <p className="mt-1 line-clamp-3 break-words text-xs text-red-200/90 sm:mt-2 sm:text-sm">{run.error ?? "Unknown error"}</p>
                <p className="mt-1 text-[10px] text-crm-faint sm:mt-2 sm:text-xs">See agents/prospector/worker.log for full output.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRun(null)}
              className="shrink-0 rounded-lg border border-crm-border bg-crm-raised px-3 py-2 text-xs font-semibold text-crm-text transition hover:bg-slate-700 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:self-start"
            >
              Dismiss
            </button>
          </div>
          <ProspectorActivityFooter run={run} />
        </div>
      );
    }

    const p = pct(run);
    const phase = runPhase(run);
    const indeterminate = run.processed === 0 && run.total === 0;
    const stepIdx = phaseStepIndex(phase);

    return (
      <div className="flex min-h-0 w-full flex-col rounded-2xl border border-crm-border bg-gradient-to-br from-slate-800/50 to-slate-950/80 p-3 shadow-lg shadow-black/30 ring-1 ring-teal-500/10 sm:p-4">
        <PhaseStrip activeIndex={stepIdx} variant="teal" />

        <div className="flex flex-wrap items-start justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-crm-text sm:text-sm">
              Scrape — {run.metro} {run.zip}
            </span>
            <span className="ml-1.5 text-[10px] font-medium text-teal-300 animate-pulse sm:ml-2 sm:text-xs">running</span>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-crm-faint sm:mt-1 sm:text-[11px] sm:line-clamp-none">
              {indeterminate
                ? "Worker is starting (DB + Places). First batch telemetry will land in a few seconds."
                : phase === "warming"
                  ? "Waiting on first batch from Google Places…"
                  : `${phaseLabel(phase)} — watch counts below tick up.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-crm-border bg-crm-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
              {phaseLabel(phase)}
            </span>
            <span className="text-xs font-mono text-crm-faint">{indeterminate ? "—" : `${p}%`}</span>
            <button
              type="button"
              onClick={() => setRun(null)}
              className="rounded-lg border border-crm-border bg-crm-raised/80 px-3 py-1 text-xs font-semibold text-crm-muted transition hover:border-white/20 hover:bg-slate-700 hover:text-crm-text"
            >
              Dismiss
            </button>
          </div>
        </div>

        {indeterminate ? (
          <IndeterminateBar colors="from-teal-700/40 via-teal-400 to-cyan-300" />
        ) : (
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-crm-bg ring-1 ring-white/10 sm:h-2.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-600 via-teal-400 to-cyan-400 transition-all duration-1000"
              style={{ width: `${p}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-crm-faint sm:gap-x-3 sm:text-xs">
          <span className="min-w-0 flex-1 truncate">
            {run.current_business ? run.current_business : "Preparing…"}
          </span>
          {run.processed > 0 && <span className="shrink-0">{eta(run)}</span>}
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px] text-crm-faint sm:mt-2 sm:gap-2 sm:text-[11px]">
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Checked</p>
            <p className="font-mono text-xs font-semibold text-crm-text sm:text-sm">
              {run.processed}
              <span className="text-crm-faint">/{run.total || "…"}</span>
            </p>
          </div>
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Inserted</p>
            <p className="font-mono text-xs font-semibold text-teal-200/90 sm:text-sm">{run.inserted}</p>
          </div>
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Rate</p>
            <p className="font-mono text-xs font-semibold text-crm-muted sm:text-sm">{rate(run)}</p>
          </div>
        </div>

        <div className="mt-1.5 min-h-0 shrink-0 sm:mt-2">
          {run.status === "running" && (!run.events || run.events.length === 0) && (
            <div className="rounded-md border border-dashed border-crm-border bg-crm-raised px-2 py-1.5 sm:rounded-lg sm:p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-crm-faint sm:text-[10px]">Live log</p>
              <p className="mt-0.5 text-[10px] leading-snug text-crm-faint sm:mt-1 sm:text-[11px]">Waiting for first audit events…</p>
            </div>
          )}

          {run.events && run.events.length > 0 && (
            <div className="flex min-h-0 flex-col rounded-lg border border-crm-border bg-crm-bg/60 p-2 ring-1 ring-inset ring-white/5 sm:rounded-xl sm:p-3">
              <p className="mb-1 shrink-0 text-[9px] font-semibold uppercase tracking-[0.15em] text-crm-faint sm:mb-2 sm:text-[10px]">Recent activity</p>
              <ul className="max-h-[5rem] space-y-0.5 overflow-y-auto pr-1 sm:max-h-28 sm:space-y-1.5">
              {run.events.slice(0, 5).map((event, idx) => {
                const payload = event.payload ?? {};
                const batchIndex = typeof payload.batch_index === "number" ? payload.batch_index : null;
                const totalBatches = typeof payload.total_batches === "number" ? payload.total_batches : null;
                const details =
                  batchIndex && totalBatches ? ` (${batchIndex}/${totalBatches})` : "";
                const eventId = `${event.action}-${event.created_at}-${idx}`;
                const expanded = activeEvent === eventId;
                const batchSize = payloadNum(event.payload, "batch_size");
                const workers = payloadNum(event.payload, "max_workers");
                const processed = payloadNum(event.payload, "processed");
                const scored = payloadNum(event.payload, "scored_so_far");
                return (
                  <li key={eventId} className="text-[11px] text-crm-muted">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveEvent(expanded ? null : eventId)}
                        className="truncate text-left transition-colors hover:text-crm-text"
                      >
                        {actionLabel(event.action)}
                        {details}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveEvent(expanded ? null : eventId)}
                          className="rounded border border-crm-border px-2 py-0.5 text-[10px] text-crm-muted transition-colors hover:border-white/20 hover:text-crm-text"
                        >
                          {expanded ? "Hide" : "Details"}
                        </button>
                        <span className="text-crm-faint">
                          {new Date(event.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2 rounded border border-crm-border bg-crm-surface p-2 text-[10px] text-crm-muted">
                        <span>Batch size: {batchSize ?? "n/a"}</span>
                        <span>Workers: {workers ?? "n/a"}</span>
                        <span>Processed: {processed ?? "n/a"}</span>
                        <span>Scored: {scored ?? "n/a"}</span>
                      </div>
                    )}
                  </li>
                );
              })}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col">
      {!open ? (
        <div className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-950/35 via-slate-900/90 to-slate-950 p-4 shadow-lg ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-teal-400/15 blur-2xl" aria-hidden />
          <div className="relative flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400/90">Step 1 · Discover</p>
            <h3 className="mt-1.5 text-base font-bold tracking-tight text-crm-text sm:mt-2 sm:text-lg">Scrape from Google Places</h3>
            <p className="mt-1.5 text-xs leading-snug text-crm-muted sm:mt-2 sm:text-sm sm:leading-relaxed">
              Add or refresh restaurants for a metro or ZIP. Each row starts as{" "}
              <span className="font-medium text-amber-200/85">analysis pending</span> until you run Analyze.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-crm-faint">In pipeline</p>
                <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-crm-text sm:text-lg">
                  {pipeline.total.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/70">Awaiting analyze</p>
                <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-amber-100 sm:text-lg">
                  {pipeline.pending.toLocaleString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 w-full rounded-xl bg-gradient-to-b from-teal-500 to-teal-600 py-2 text-sm font-semibold text-crm-text shadow-lg shadow-teal-900/35 ring-1 ring-white/10 transition hover:from-teal-400 hover:to-teal-500 sm:mt-4 sm:py-2.5"
            >
              Choose area &amp; run
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${CONFIGURE_SHELL} border-teal-500/20 bg-gradient-to-b from-slate-900/95 to-slate-950 shadow-md shadow-black/20`}
        >
          <header className="shrink-0 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400/90">Configure scrape</p>
            <p className="text-xs leading-snug text-crm-faint">Choose a saved metro or ZIP, then start the worker.</p>
          </header>

          <div className="min-h-0 shrink-0 space-y-1.5">
            <label htmlFor={areaFieldId} className="block text-[10px] font-semibold uppercase tracking-wide text-crm-faint">
              Area
            </label>
            <select id={areaFieldId} value={selected} onChange={(e) => setSelected(e.target.value)} className={CONTROL_CLASS}>
              {Object.keys(METRO_ZIPS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-crm-border pt-3">
            <button
              type="button"
              onClick={startRun}
              disabled={starting}
              className="h-10 w-full rounded-lg bg-gradient-to-b from-teal-500 to-teal-600 text-sm font-semibold text-crm-text shadow-md shadow-teal-950/35 transition hover:from-teal-400 hover:to-teal-500 disabled:opacity-50"
            >
              {starting ? "Starting…" : "Run scrape"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="py-1 text-center text-xs font-medium text-crm-faint transition hover:text-crm-muted"
            >
              ← Back to overview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
