import Link from "next/link";
import ProspectorButton from "../prospector-button";
import AnalyzerButton from "../analyzer-button";
import { PipelineStatsStrip } from "../pipeline-stats-strip";
import { getPipelineSummary } from "../data";

const CARD_GRID =
  "grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start lg:gap-4 lg:max-h-[min(32rem,calc(100dvh-15rem))] lg:overflow-y-auto lg:pr-1";
const CARD_CELL = "flex min-h-0 min-w-0 flex-col";

export default async function LeadsPipelinePage() {
  const pipeline = await getPipelineSummary();

  return (
    <div className="relative flex min-h-0 w-full max-w-full flex-col">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-teal-400/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 top-32 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden
      />

      <header className="relative mb-4 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Grow the pool</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white sm:text-2xl">Find leads</h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-snug text-slate-400 sm:text-sm sm:leading-normal">
          Scrape places, then analyze to surface <span className="text-slate-300">horrid / missing websites</span> —
          your rebuild targets. Day-to-day outreach stays on{" "}
          <Link href="/admin/leads" className="font-medium text-teal-400/90 hover:underline">
            Leads
          </Link>{" "}
          (sorted worst sites first).
        </p>
      </header>

      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-visible rounded-2xl border border-white/[0.09] bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-zinc-950/85 p-4 shadow-xl shadow-black/35 ring-1 ring-white/[0.06] backdrop-blur-sm md:p-5">
        <div className="mb-3 flex flex-col gap-1 border-b border-white/[0.06] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Overview</p>
          <p className="text-xs text-slate-500">Counts reflect your full leads table (not the 200-row preview).</p>
        </div>
        <PipelineStatsStrip stats={pipeline} />
        <div className={CARD_GRID}>
          <div className={CARD_CELL}>
            <ProspectorButton pipeline={pipeline} />
          </div>
          <div className={CARD_CELL}>
            <AnalyzerButton pipeline={pipeline} />
          </div>
          <aside className="flex min-h-[240px] min-w-0 flex-col gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-zinc-900/80 via-slate-900/55 to-slate-950/95 p-4 ring-1 ring-inset ring-white/[0.04] sm:min-h-[252px]">
            <header className="shrink-0 space-y-0.5 border-b border-white/[0.06] pb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Flow</p>
              <h2 className="text-sm font-semibold text-zinc-100">How this fits together</h2>
              <p className="text-xs leading-snug text-slate-500">Order of operations for this workspace.</p>
            </header>
            <ol className="min-h-0 flex-1 space-y-2.5 text-xs leading-snug text-slate-400">
              <li className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-500/18 text-[11px] font-bold text-teal-200 ring-1 ring-teal-500/25">
                  1
                </span>
                <span>
                  <strong className="text-slate-200">Scrape</strong> — Google Places into your pipeline.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/18 text-[11px] font-bold text-violet-200 ring-1 ring-violet-500/25">
                  2
                </span>
                <span>
                  <strong className="text-slate-200">Analyze</strong> — grade sites; F/C = rebuild targets.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-600/45 text-[11px] font-bold text-slate-200 ring-1 ring-white/10">
                  3
                </span>
                <span>
                  <strong className="text-slate-200">Leads</strong> — pitch affordable rebuilds + hourly updates.
                </span>
              </li>
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
