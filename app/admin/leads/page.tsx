import Link from "next/link";
import StatusSelect from "./components/status-select";
import { LeadStatus } from "@/lib/lead-status";
import { getLeads, getPipelineSummary, type PeopleView } from "./data";
import AddLeadForm from "./add-lead-form";
import LeadsToolbar from "./leads-toolbar";
import { formatMoney } from "@/lib/billing";

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
  searchParams: Promise<{ tier?: string; status?: string; sort?: string; q?: string; view?: string }>;
}) {
  const { tier, status, sort, q, view: viewParam } = await searchParams;
  const view: PeopleView = viewParam === "customers" ? "customers" : "leads";
  const isCustomers = view === "customers";
  // Ignore status=closed_won on leads view; customers view ignores other statuses
  const effectiveStatus = isCustomers ? undefined : status === "closed_won" ? undefined : status;
  const filters = { tier, status: effectiveStatus, q, view };
  const [leads, pipeline] = await Promise.all([
    getLeads(filters, sort),
    getPipelineSummary(filters),
  ]);

  const hasActiveFilters = Boolean(q?.trim() || effectiveStatus || tier);

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

      <header className="relative mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">CRM</p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {isCustomers ? "Customers" : "Leads"}
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-slate-400">
            {isCustomers ? (
              <>
                Closed-won accounts. Conversation and billing live on each record. Mark a lead Closed Won to move it here.
              </>
            ) : (
              <>
                Prioritize restaurants with horrible sites — affordable rebuilds, then hourly updates.{" "}
                <Link
                  href="/admin/leads/pipeline"
                  className="font-medium text-teal-400/90 underline-offset-2 hover:underline"
                >
                  Find leads
                </Link>{" "}
                when the pool is thin.
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {!isCustomers ? <AddLeadForm /> : null}
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 shadow-inner shadow-black/20">
            {hasActiveFilters
              ? `${leads.length} ${leads.length === 1 ? "match" : "matches"}`
              : `${pipeline.total.toLocaleString()} ${
                  isCustomers
                    ? pipeline.total === 1
                      ? "customer"
                      : "customers"
                    : pipeline.total === 1
                      ? "lead"
                      : "leads"
                }`}
          </span>
          {!isCustomers && !hasActiveFilters && pipeline.pending > 0 ? (
            <Link
              href="/admin/leads/pipeline"
              className="rounded-full border border-amber-500/25 bg-amber-950/30 px-3 py-1 text-[11px] font-medium text-amber-100/90 transition hover:border-amber-500/40"
            >
              {pipeline.pending.toLocaleString()} need analysis →
            </Link>
          ) : null}
        </div>
      </header>

      <LeadsToolbar view={view} q={q} status={effectiveStatus} tier={tier} sort={sort} />

      {leads.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-12 text-center">
          <p className="text-base font-medium text-slate-200">
            {hasActiveFilters
              ? "No matches"
              : isCustomers
                ? "No customers yet"
                : "No active leads"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            {hasActiveFilters ? (
              "Try clearing search or filters."
            ) : isCustomers ? (
              <>
                Set a lead&apos;s status to Closed Won to promote them here.
              </>
            ) : (
              <>
                Use <span className="text-slate-300">Add lead</span>, or{" "}
                <Link href="/admin/leads/pipeline" className="font-medium text-teal-400/90 hover:underline">
                  Find leads
                </Link>
                .
              </>
            )}
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
                  {isCustomers ? "Customer" : "Business"}
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {isCustomers ? "Contact" : "Location"}
                </th>
                {isCustomers ? (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Billing
                  </th>
                ) : (
                  <>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:min-w-[12rem]">
                      Site snapshot
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Grade
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Rating
                    </th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {leads.map((lead: {
                id: string;
                business_name: string;
                metro: string;
                zip: string;
                tier: string;
                status: string;
                analysis_status: string;
                site_grade?: string | null;
                pitch_angle?: string | null;
                google_rating: number;
                google_review_count: number;
                website_url?: string | null;
                contact_email?: string | null;
                phone?: string | null;
                outstanding_cents?: number;
                collected_cents?: number;
                invoice_count?: number;
              }) => (
                <tr
                  key={lead.id}
                  className="group transition-colors even:bg-slate-900/25 hover:bg-teal-500/[0.035]"
                >
                  <td className="border-l-2 border-l-transparent py-3 pl-4 pr-3 align-middle transition-colors group-hover:border-l-teal-400/55">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="flex flex-col gap-0.5 text-white hover:text-teal-300"
                    >
                      <span className="font-medium leading-snug">{lead.business_name}</span>
                      {!isCustomers && lead.contact_email ? (
                        <span className="truncate text-[11px] text-slate-500">{lead.contact_email}</span>
                      ) : null}
                      {isCustomers ? (
                        <span className="text-[11px] text-slate-500">
                          {[lead.metro, lead.zip].filter(Boolean).join(" ") || "—"}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle text-slate-400">
                    {isCustomers ? (
                      <Link href={`/admin/leads/${lead.id}`} className="block text-xs hover:text-slate-200">
                        <div>{lead.contact_email || "—"}</div>
                        <div className="text-[11px] text-slate-600">{lead.phone || ""}</div>
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200"
                      >
                        <span>
                          {lead.metro || "—"}{" "}
                          <span className="tabular-nums text-slate-500">{lead.zip ?? ""}</span>
                        </span>
                      </Link>
                    )}
                  </td>
                  {isCustomers ? (
                    <td className="px-4 py-3 align-middle text-xs">
                      <Link href={`/admin/leads/${lead.id}`} className="block hover:opacity-90">
                        {(lead.invoice_count ?? 0) === 0 ? (
                          <span className="text-slate-600">No invoices</span>
                        ) : (lead.outstanding_cents ?? 0) > 0 ? (
                          <span className="text-amber-300/90">
                            {formatMoney(lead.outstanding_cents ?? 0)} due
                          </span>
                        ) : (
                          <span className="text-emerald-300/80">
                            {formatMoney(lead.collected_cents ?? 0)} collected
                          </span>
                        )}
                      </Link>
                    </td>
                  ) : (
                    <>
                      <td className="max-w-[14rem] px-4 py-3 align-middle text-xs text-slate-300 lg:max-w-[20rem]">
                        <Link href={`/admin/leads/${lead.id}`} className="block hover:text-slate-100">
                          {lead.analysis_status === "pending" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-white/15 bg-slate-900/50 px-2 py-1 text-[11px] font-medium text-slate-500">
                              Not analyzed yet
                            </span>
                          ) : (
                            <span className="line-clamp-2">{lead.pitch_angle ?? "—"}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link href={`/admin/leads/${lead.id}`} className="block">
                          {lead.analysis_status === "pending" ? (
                            <span className="text-slate-600">—</span>
                          ) : (
                            <span
                              className={`inline-flex min-w-[2rem] justify-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${
                                lead.site_grade === "F"
                                  ? "bg-red-500/20 text-red-200 ring-1 ring-red-500/30"
                                  : lead.site_grade === "C"
                                    ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/25"
                                    : lead.site_grade === "B"
                                      ? "bg-sky-500/20 text-sky-100 ring-1 ring-sky-500/25"
                                      : lead.site_grade === "A"
                                        ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/30"
                                        : "bg-slate-700 text-slate-200"
                              }`}
                            >
                              {lead.site_grade ?? "—"}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link href={`/admin/leads/${lead.id}`} className="block">
                          {lead.google_rating ? (
                            <StarRow rating={Number(lead.google_rating)} count={lead.google_review_count} />
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </Link>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 align-middle text-slate-400">
                    <StatusSelect leadId={lead.id} status={lead.status as LeadStatus} compact />
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
