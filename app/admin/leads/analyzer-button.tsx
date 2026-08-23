"use client";

import { useState, useEffect, useCallback, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PipelineSummary } from "./pipeline-stats-strip";
import { crm } from "@/lib/admin-ui";

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
  if (action === "analyzer_run_start") return "Analyzer started";
  if (action === "analyzer_run_complete") return "Analyzer complete";
  return action.replaceAll("_", " ");
}

function analyzerPhase(run: RunStatus): string {
  if (run.status === "failed") return "failed";
  if (run.status === "complete") return "complete";
  if (run.status === "running" && run.total === 0) return "queue";
  if (run.status === "running" && run.processed === 0 && run.total > 0) return "spinup";
  if (run.status === "running") return "work";
  return "idle";
}

function phaseLabel(phase: string): string {
  if (phase === "queue") return "Loading queue";
  if (phase === "spinup") return "Spinning up";
  if (phase === "work") return "Scoring sites";
  if (phase === "complete") return "Complete";
  if (phase === "failed") return "Failed";
  if (phase === "idle") return "Idle";
  return "Running";
}

function analyzerStepIndex(phase: string): number {
  if (phase === "queue") return 0;
  if (phase === "spinup") return 1;
  if (phase === "work" || phase === "complete") return 2;
  return 0;
}

function PhaseStrip({ activeIndex }: { activeIndex: number }) {
  const labels = ["Queue", "Workers", "Sites"];
  return (
    <div className="mb-2 grid grid-cols-3 gap-1">
      {labels.map((label, i) => (
        <div
          key={label}
          className={`rounded-md border px-1 py-1 text-center text-[8px] font-bold uppercase tracking-wide sm:rounded-lg sm:px-1.5 sm:py-1.5 sm:text-[9px] ${
            i <= activeIndex
              ? "border-violet-500/35 bg-violet-500/10 text-violet-100"
              : "border-crm-border bg-crm-raised text-crm-faint"
          }`}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function IndeterminateBar() {
  return (
    <div className="relative mb-2 h-2 overflow-hidden rounded-full bg-crm-bg ring-1 ring-white/10 sm:mb-2.5 sm:h-2.5">
      <div className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-gradient-to-r from-violet-700/40 via-indigo-400 to-sky-300 animate-pipeline-indeterminate opacity-90 shadow-[0_0_12px_rgba(139,92,246,0.35)]" />
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

function analyzerCompleteCopy(run: RunStatus): { headline: string; detail: string; strong: boolean } {
  if (run.inserted > 0) {
    return {
      headline: `${run.inserted.toLocaleString()} lead${run.inserted === 1 ? "" : "s"} updated`,
      detail:
        "Snapshots and grades are saved. Open Lead pool to work outreach, or dismiss this card when you are done here.",
      strong: true,
    };
  }
  if (run.processed > 0) {
    return {
      headline: "Run finished — no rows saved",
      detail: `Visited ${run.processed.toLocaleString()} site(s) but wrote 0 updates. If that is unexpected, check GitHub Actions → Agent — Analyzer.`,
      strong: false,
    };
  }
  return {
    headline: "Nothing to analyze",
    detail:
      "There were no pending leads in range, or the queue was empty. Scrape new leads first, or raise the batch limit on the next run.",
    strong: false,
  };
}

function ActivityFooter({ run }: { run: RunStatus }) {
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
const ANALYZE_CONTROL_CLASS = `${crm.input} h-10 [color-scheme:dark]`;

export default function AnalyzerButton({ pipeline }: { pipeline: PipelineSummary }) {
  const router = useRouter();
  const limitFieldId = useId();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(200);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [run, setRun] = useState<RunStatus | null>(null);

  const fetchRun = useCallback(async (id: string) => {
    const res = await fetch(`/api/analyzer/${id}`);
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
    setStartError(null);
    const res = await fetch("/api/analyzer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.runId) {
      await fetchRun(data.runId);
    }
    if (!res.ok) {
      setStartError(typeof data.error === "string" ? data.error : "Could not start analysis.");
    }
    setStarting(false);
    if (res.ok) setOpen(false);
  }

  if (run) {
    if (run.status === "complete") {
      const copy = analyzerCompleteCopy(run);
      const success = copy.strong;
      return (
        <div
          className={`flex min-h-0 w-full flex-col rounded-2xl border p-3 shadow-lg ring-1 sm:p-4 ${
            success
              ? "border-emerald-500/35 bg-gradient-to-br from-emerald-950/50 via-slate-900/80 to-slate-950 ring-emerald-500/15"
              : "border-amber-500/25 bg-gradient-to-br from-amber-950/25 via-slate-900/80 to-slate-950 ring-amber-500/10"
          }`}
        >
          <div className="mb-2 grid grid-cols-3 gap-1 sm:mb-3 sm:gap-1.5">
            {(["Queue", "Workers", "Sites"] as const).map((label) => (
              <div
                key={label}
                className={`rounded-md border px-1 py-1.5 text-center text-[8px] font-bold uppercase tracking-wide sm:rounded-lg sm:px-1.5 sm:py-2 sm:text-[9px] ${
                  success
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
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
                    ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30"
                    : "bg-amber-500/15 text-amber-200 ring-amber-400/25"
                }`}
              >
                {success ? (
                  <CheckIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                ) : (
                  <InfoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-crm-faint sm:text-[10px] sm:tracking-[0.2em]">Analyze leads</p>
                <h3 className={`mt-0.5 text-base font-bold leading-snug sm:mt-1 sm:text-lg ${success ? "text-crm-text" : "text-crm-text"}`}>
                  {copy.headline}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-crm-muted sm:mt-1.5 sm:text-sm sm:leading-relaxed">{copy.detail}</p>
                {run.total > 0 ? (
                  <p className="mt-1.5 font-mono text-[10px] text-crm-faint sm:mt-2 sm:text-xs">
                    Run scope: {run.processed.toLocaleString()} / {run.total.toLocaleString()} processed ·{" "}
                    {run.inserted.toLocaleString()} written
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRun(null)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:self-start ${
                success
                  ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-crm-text shadow-md shadow-emerald-950/40 hover:from-emerald-400 hover:to-emerald-500"
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
                  ? "w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400"
                  : "w-full bg-gradient-to-r from-amber-600/80 via-amber-500/60 to-slate-600/50"
              }`}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
            <Link
              href="/admin/leads"
              className="inline-flex items-center justify-center rounded-lg border border-crm-border bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-crm-text transition hover:border-teal-500/40 hover:bg-teal-500/10 hover:text-crm-text sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
            >
              Open lead pool
            </Link>
          </div>

          <ActivityFooter run={run} />
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
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-red-300/80 sm:text-[10px] sm:tracking-[0.2em]">Analyze leads</p>
                <h3 className="mt-0.5 text-base font-bold text-crm-text sm:mt-1 sm:text-lg">Run failed</h3>
                <p className="mt-1 line-clamp-3 break-words text-xs text-red-200/90 sm:mt-2 sm:text-sm">{run.error ?? "Unknown error"}</p>
                <p className="mt-1 text-[10px] text-crm-faint sm:mt-2 sm:text-xs">
                  Check GitHub Actions → Agent — Analyzer for logs.
                </p>
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
          <ActivityFooter run={run} />
        </div>
      );
    }

    const p = pct(run);
    const phase = analyzerPhase(run);
    const queueUnknown = run.status === "running" && run.total === 0;
    const spinup = run.status === "running" && run.total > 0 && run.processed === 0;
    const showMarquee = queueUnknown || spinup;
    const stepIdx = analyzerStepIndex(phase);

    return (
      <div className="flex min-h-0 w-full flex-col rounded-2xl border border-crm-border bg-gradient-to-br from-slate-800/50 via-slate-900/60 to-indigo-950/40 p-3 shadow-lg shadow-black/30 ring-1 ring-violet-500/15 sm:p-4">
        <PhaseStrip activeIndex={stepIdx} />

        <div className="flex flex-wrap items-start justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-crm-text sm:text-sm">Analyze leads</span>
            <span className="ml-1.5 text-[10px] font-medium text-violet-300 animate-pulse sm:ml-2 sm:text-xs">running</span>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-crm-faint sm:mt-1 sm:text-[11px] sm:line-clamp-none">
              {queueUnknown
                ? "Resolving how many pending leads to process — total ticks up when the worker finishes counting."
                : spinup
                  ? "Playwright workers are starting; first site will show below shortly."
                  : `${phaseLabel(phase)} — each row commits to the DB as soon as it finishes.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-crm-border bg-crm-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
              {phaseLabel(phase)}
            </span>
            <span className="text-xs font-mono text-crm-faint">{showMarquee ? "—" : `${p}%`}</span>
            <button
              type="button"
              onClick={() => setRun(null)}
              className="rounded-lg border border-crm-border bg-crm-raised/80 px-3 py-1 text-xs font-semibold text-crm-muted transition hover:border-white/20 hover:bg-slate-700 hover:text-crm-text"
            >
              Dismiss
            </button>
          </div>
        </div>

        {showMarquee ? (
          <IndeterminateBar />
        ) : (
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-crm-bg ring-1 ring-white/10 sm:h-2.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-sky-400 transition-all duration-1000"
              style={{ width: `${p}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-crm-faint sm:gap-x-3 sm:text-xs">
          <span className="min-w-0 flex-1 truncate">
            {run.current_business ? run.current_business : "Starting…"}
          </span>
          {run.processed > 0 && <span className="shrink-0">{eta(run)}</span>}
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px] text-crm-faint sm:mt-2 sm:gap-2 sm:text-[11px]">
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Written</p>
            <p className="font-mono text-xs font-semibold text-violet-200/90 sm:text-sm">{run.inserted}</p>
          </div>
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Progress</p>
            <p className="font-mono text-xs font-semibold text-crm-text sm:text-sm">
              {run.processed}
              <span className="text-crm-faint">/{run.total || "…"}</span>
            </p>
          </div>
          <div className="rounded-md border border-crm-border bg-crm-raised px-1.5 py-1 text-center sm:rounded-lg sm:px-2 sm:py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-crm-faint sm:text-[9px]">Rate</p>
            <p className="font-mono text-xs font-semibold text-crm-muted sm:text-sm">{rate(run)}</p>
          </div>
        </div>

        <div className="mt-1.5 min-h-0 shrink-0 sm:mt-2">
          {run.status === "running" && (!run.events || run.events.length === 0) && (
            <div className="rounded-md border border-dashed border-crm-border bg-crm-raised px-2 py-1.5 sm:rounded-lg sm:p-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-crm-faint sm:text-[10px]">Activity</p>
              <p className="mt-0.5 text-[10px] leading-snug text-crm-faint sm:mt-1 sm:text-[11px]">Events appear as the worker logs milestones.</p>
            </div>
          )}

          {run.events && run.events.length > 0 && (
            <div className="rounded-lg border border-crm-border bg-crm-bg/60 p-2 ring-1 ring-inset ring-white/5 sm:rounded-xl sm:p-3">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-crm-faint sm:mb-2 sm:text-[10px]">Activity</p>
              <ul className="max-h-[4.5rem] space-y-0.5 overflow-y-auto pr-1 text-[10px] text-crm-muted sm:max-h-24 sm:space-y-1 sm:text-[11px]">
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col">
      {!open ? (
        <div className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/30 via-slate-900/90 to-slate-950 p-4 shadow-lg ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -left-8 -bottom-8 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl" aria-hidden />
          <div className="relative flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">Step 2 · Enrich</p>
            <h3 className="mt-1.5 text-base font-bold tracking-tight text-crm-text sm:mt-2 sm:text-lg">Analyze websites</h3>
            <p className="mt-1.5 text-xs leading-snug text-crm-muted sm:mt-2 sm:text-sm sm:leading-relaxed">
              Visits each pending lead, captures UX signals, and writes <span className="font-medium text-teal-200/80">grade + snapshot</span>{" "}
              immediately per row.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-amber-500/25 bg-amber-950/25 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/80">Ready to analyze</p>
                <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-amber-50 sm:text-lg">
                  {pipeline.pending.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-teal-500/20 bg-teal-950/15 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-200/70">Already done</p>
                <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-teal-100 sm:text-lg">
                  {pipeline.complete.toLocaleString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 w-full rounded-xl bg-gradient-to-b from-violet-500 to-indigo-600 py-2 text-sm font-semibold text-crm-text shadow-lg shadow-violet-950/45 ring-1 ring-white/10 transition hover:from-violet-400 hover:to-indigo-500 sm:mt-4 sm:py-2.5"
            >
              Set batch size &amp; run
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${CONFIGURE_SHELL} border-violet-500/20 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-indigo-950/50 shadow-md shadow-black/20`}
        >
          <header className="shrink-0 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/90">Configure analyze</p>
            <p className="text-xs leading-snug text-crm-faint">
              Pending leads only. Visits up to <span className="font-medium text-crm-muted">5000</span> sites per run.
            </p>
          </header>

          <div className="min-h-0 shrink-0 space-y-1.5">
            <label htmlFor={limitFieldId} className="block text-[10px] font-semibold uppercase tracking-wide text-crm-faint">
              Batch limit
            </label>
            <input
              id={limitFieldId}
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 200)}
              className={ANALYZE_CONTROL_CLASS}
            />
            <p className="text-[10px] text-crm-faint">Range 1–5000 · counts only rows still needing analysis.</p>
          </div>

          <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-crm-border pt-3">
            {startError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {startError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={startRun}
              disabled={starting}
              className="h-10 w-full rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 text-sm font-semibold text-crm-text shadow-md shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50"
            >
              {starting ? "Starting…" : "Run analyzer"}
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
