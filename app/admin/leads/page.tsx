import Link from "next/link";
import StatusSelect from "./components/status-select";
import { LeadStatus } from "@/lib/lead-status";
import { getLeads, getPipelineSummary, type PeopleView } from "./data";
import AddLeadForm from "./add-lead-form";
import LeadsToolbar from "./leads-toolbar";
import { formatMoney } from "@/lib/billing";
import { crm, gradeTone } from "@/lib/admin-ui";

function StarRow({ rating, count }: { rating: number | string; count: number | string }) {
  const r = typeof rating === "number" ? rating : Number(rating);
  const c = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(r)) {
    return <span className="text-crm-faint">—</span>;
  }
  const reviews = Number.isFinite(c) ? c : 0;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm leading-none text-crm-muted" aria-hidden>
        ★
      </span>
      <span className="font-medium tabular-nums text-crm-text">{r.toFixed(1)}</span>
      <span className="text-xs text-crm-faint">({reviews.toLocaleString()})</span>
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
    <div className="w-full">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={crm.pageTitle}>{isCustomers ? "Customers" : "Leads"}</h1>
          <p className="mt-1 max-w-lg text-sm text-crm-muted">
            {isCustomers ? (
              <>Closed-won accounts. Conversation and billing live on each record.</>
            ) : (
              <>
                Prioritize neighborhood bars and pubs with weak or missing sites.{" "}
                <Link href="/admin/leads/pipeline" className={crm.link}>
                  Find leads
                </Link>{" "}
                when the pool is thin.
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {!isCustomers ? <AddLeadForm /> : null}
          <span className="text-xs text-crm-faint">
            {hasActiveFilters
              ? `${leads.length} ${leads.length === 1 ? "match" : "matches"}`
              : `${pipeline.total.toLocaleString()} total`}
          </span>
          {!isCustomers && !hasActiveFilters && pipeline.pending > 0 ? (
            <Link href="/admin/leads/pipeline" className={`${crm.link} text-xs`}>
              {pipeline.pending.toLocaleString()} need analysis →
            </Link>
          ) : null}
        </div>
      </header>

      <LeadsToolbar view={view} q={q} status={effectiveStatus} tier={tier} sort={sort} />

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-crm-border p-12 text-center">
          <p className="text-base font-medium text-crm-text">
            {hasActiveFilters
              ? "No matches"
              : isCustomers
                ? "No customers yet"
                : "No active leads"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-crm-muted">
            {hasActiveFilters ? (
              "Try clearing search or filters."
            ) : isCustomers ? (
              <>
                Set a lead&apos;s status to Closed Won to promote them here.
              </>
            ) : (
              <>
                Use <span className="text-crm-text">Add lead</span>, or{" "}
                <Link href="/admin/leads/pipeline" className={crm.link}>
                  Find leads
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <div className={crm.list}>
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
            contact_name?: string | null;
            contact_email?: string | null;
            phone?: string | null;
            place_types?: string[] | null;
            outstanding_cents?: number;
            collected_cents?: number;
            invoice_count?: number;
          }) => (
            <div key={lead.id} className={crm.listRow}>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/leads/${lead.id}`} className="font-medium text-crm-text hover:text-crm-accent">
                  {lead.business_name}
                </Link>
                <p className="mt-0.5 text-sm text-crm-muted">
                  {isCustomers
                    ? [lead.contact_email, lead.phone].filter(Boolean).join(" · ") || lead.metro
                    : [
                        [lead.contact_name, lead.contact_email].filter(Boolean).join(" · "),
                        [lead.metro, lead.zip].filter(Boolean).join(" "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>

              {!isCustomers ? (
                <div className="hidden min-w-0 flex-[1.5] text-sm text-crm-muted md:block">
                  {lead.analysis_status === "pending" ? (
                    <span className="text-crm-faint">Needs analysis</span>
                  ) : (
                    <span className="line-clamp-2">{lead.pitch_angle ?? "—"}</span>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                {!isCustomers && lead.place_types?.includes("bar") ? (
                  <span className={crm.badge("neutral")}>Bar</span>
                ) : null}
                {!isCustomers && lead.analysis_status !== "pending" && lead.site_grade ? (
                  <span className={crm.badge(gradeTone(lead.site_grade))}>{lead.site_grade}</span>
                ) : null}
                {!isCustomers && lead.google_rating ? (
                  <StarRow rating={Number(lead.google_rating)} count={lead.google_review_count} />
                ) : null}
                {isCustomers ? (
                  <span className="text-sm text-crm-muted">
                    {(lead.invoice_count ?? 0) === 0
                      ? "No invoices"
                      : (lead.outstanding_cents ?? 0) > 0
                        ? `${formatMoney(lead.outstanding_cents ?? 0)} due`
                        : `${formatMoney(lead.collected_cents ?? 0)} collected`}
                  </span>
                ) : null}
                <StatusSelect leadId={lead.id} status={lead.status as LeadStatus} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
