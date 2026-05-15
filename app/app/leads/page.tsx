import Link from "next/link";
import StatusSelect from "./components/status-select";
import { LeadStatus } from "@/lib/lead-status";
import { getLeads, getPipelineSummary } from "./data";

function StarRow({ rating, count }: { rating: number | string; count: number | string }) {
  const r = typeof rating === "number" ? rating : Number(rating);
  const c = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(r)) {
    return <span className="text-slate-600">—</span>;
  }
  const reviews = Number.isFinite(c) ? c : 0;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm leading-none text-amber-400/90" aria-hidden>
        ★
      </span>
      <span className="font-medium tabular-nums text-white">{r.toFixed(1)}</span>
      <span className="text-[11px] text-slate-500">({reviews.toLocaleString()})</span>
    </span>
  );
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; status?: string; sort?: string }>;
}) {
  const { tier, status, sort } = await searchParams;
  const [leads, pipeline] = await Promise.all([
    getLeads(tier, status, sort),
    getPipelineSummary(tier, status),
  ]);

  const SORT_OPTS = [
    { key: "newest", label: "Newest" },
    { key: "grade", label: "Worst Sites First" },
    { key: "pending", label: "Needs Analysis" },
  ];

  return (
    <div className="relative w-full">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-80 w-80 rounded-full bg-teal-400/14 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 top-48 h-72 w-72 rounded-full bg-violet-500/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-96 -translate-x-1/2 rounded-full bg-amber-500/[0.06] blur-3xl"
        aria-hidden
      />

      <header className="relative mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Lead desk</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Leads</h1>
          <p className="mt-1.5 max-w-lg text-sm text-slate-400">
            Sort, open records, and manage status. Scrape and analyze live on the{" "}
            <Link href="/app/leads/pipeline" className="font-medium text-teal-400/90 underline-offset-2 hover:underline">
              Pipeline
            </Link>{" "}
            tab.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 shadow-inner shadow-black/20">
            {tier || status
              ? `${leads.length} ${leads.length === 1 ? "match" : "matches"}`
              : `${pipeline.total.toLocaleString()} ${pipeline.total === 1 ? "lead" : "leads"}`}
          </span>
          {!tier && !status && pipeline.pending > 0 ? (
            <Link
              href="/app/leads/pipeline"
              className="rounded-full border border-amber-500/25 bg-amber-950/30 px-3 py-1 text-[11px] font-medium text-amber-100/90 transition hover:border-amber-500/40"
            >
              {pipeline.pending.toLocaleString()} need analysis →
            </Link>
          ) : null}
          {!tier && !status && pipeline.total > 200 ? (
            <span className="text-[10px] text-slate-600">Table shows first 200 rows for this sort</span>
          ) : null}
        </div>
      </header>

      <div className="relative mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-slate-900/40 px-3 py-3 ring-1 ring-white/[0.04]">
        <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Sort</span>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-inner shadow-black/40">
          {SORT_OPTS.map((o) => (
            <Link
              key={o.key}
              href={`/app/leads?sort=${o.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                (sort ?? "newest") === o.key
                  ? "bg-gradient-to-b from-teal-500/25 to-teal-600/15 text-teal-100 shadow-sm ring-1 ring-teal-500/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        {(tier || status) && (
          <Link
            href="/app/leads"
            className="ml-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-white/20 hover:text-slate-300"
          >
            Clear filters
          </Link>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-violet-600/20 ring-1 ring-white/10">
            <span className="text-2xl" aria-hidden>
              ◎
            </span>
          </div>
          <p className="text-base font-medium text-slate-200">No leads yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Open the{" "}
            <Link href="/app/leads/pipeline" className="font-medium text-teal-400/90 hover:underline">
              Pipeline
            </Link>{" "}
            tab to scrape a metro or ZIP, then analyze.
          </p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-slate-900/50 to-slate-950/70 shadow-2xl shadow-black/40 ring-1 ring-teal-500/10">
          <div
            className="h-px bg-gradient-to-r from-transparent via-teal-400/35 to-transparent"
            aria-hidden
          />
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.08] bg-gradient-to-b from-slate-800/40 to-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Business
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:min-w-[12rem] xl:min-w-[16rem]">
                  Site snapshot
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Grade
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Analysis
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Rating
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {leads.map((lead: {
                id: string; business_name: string; metro: string; zip: string;
                tier: string; status: string; analysis_status: string;
                analyzed_at?: string | null;
                site_grade?: string | null; pitch_angle?: string | null;
                has_online_ordering?: boolean | null; has_reservations?: boolean | null;
                has_real_menu?: boolean | null; mobile_ready?: boolean | null; accessibility_ok?: boolean | null;
                google_rating: number; google_review_count: number; website_url?: string | null;
              }) => (
                <tr
                  key={lead.id}
                  className="group transition-colors even:bg-slate-900/25 hover:bg-teal-500/[0.035]"
                >
                  <td className="border-l-2 border-l-transparent py-3 pl-4 pr-3 align-middle transition-colors group-hover:border-l-teal-400/55">
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="flex items-start gap-2 text-white hover:text-teal-300"
                    >
                      <span className="min-w-0 flex-1 font-medium leading-snug">{lead.business_name}</span>
                      {lead.website_url ? (
                        <span
                          className="mt-0.5 shrink-0 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100"
                          title="Has website"
                          aria-hidden
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md text-slate-400 transition-colors hover:text-slate-200"
                    >
                      <span className="text-slate-600" aria-hidden>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                      <span>
                        {lead.metro} <span className="tabular-nums text-slate-500">{lead.zip}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 align-middle text-xs leading-relaxed text-slate-300 lg:max-w-[20rem] xl:max-w-[28rem]">
                    <Link href={`/app/leads/${lead.id}`} className="block hover:text-slate-100">
                      {lead.analysis_status === "pending" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-white/15 bg-slate-900/50 px-2 py-1 text-[11px] font-medium text-slate-500">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" aria-hidden />
                          Not analyzed yet
                        </span>
                      ) : (
                        <span className="line-clamp-2 text-slate-300">{lead.pitch_angle ?? "—"}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Link href={`/app/leads/${lead.id}`} className="block">
                      {lead.analysis_status === "pending" ? (
                        <span className="inline-block rounded-md border border-white/10 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-600">
                          —
                        </span>
                      ) : (
                        <span
                          className={`inline-flex min-w-[2rem] justify-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums shadow-sm ${
                            lead.site_grade === "F"
                              ? "bg-red-500/20 text-red-200 ring-1 ring-red-500/30"
                              : lead.site_grade === "C"
                                ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/25"
                                : lead.site_grade === "B"
                                  ? "bg-sky-500/20 text-sky-100 ring-1 ring-sky-500/25"
                                  : lead.site_grade === "A"
                                    ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/30"
                                    : "bg-slate-700 text-slate-200 ring-1 ring-white/10"
                          }`}
                        >
                          {lead.site_grade ?? "—"}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Link href={`/app/leads/${lead.id}`} className="inline-block hover:opacity-90">
                      {lead.analysis_status === "pending" ? (
                        <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200/90">
                          Queued
                        </span>
                      ) : lead.analysis_status === "failed" ? (
                        <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-300">
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-200">
                          Done
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Link href={`/app/leads/${lead.id}`} className="block hover:opacity-90">
                      {lead.google_rating ? (
                        <StarRow rating={Number(lead.google_rating)} count={lead.google_review_count} />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle text-slate-400">
                    <StatusSelect
                      leadId={lead.id}
                      status={lead.status as LeadStatus}
                      compact
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
