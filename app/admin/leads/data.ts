import { Pool } from "pg";
import type { PipelineSummary } from "./pipeline-stats-strip";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import { ensureBillingSchema } from "@/lib/billing";
import { chainLocationExcludeClause } from "@/lib/chain-brands";

export type PeopleView = "leads" | "customers";

export type LeadListFilters = {
  tier?: string;
  status?: string;
  q?: string;
  view?: PeopleView;
};

export function leadFilterClause(filters: LeadListFilters = {}): {
  where: string;
  values: string[];
} {
  const { tier, status, q, view = "leads" } = filters;
  const conditions: string[] = [];
  const values: string[] = [];

  if (view === "customers") {
    conditions.push(`status = 'closed_won'`);
  } else {
    // Lead pool: everyone still in play (not customers)
    if (status) {
      conditions.push(`status = $${values.length + 1}`);
      values.push(status);
    } else {
      conditions.push(`status <> 'closed_won'`);
    }
  }

  if (tier) {
    conditions.push(`tier = $${values.length + 1}`);
    values.push(tier);
  }
  if (q?.trim()) {
    const idx = values.length + 1;
    conditions.push(
      `(business_name ilike $${idx} or coalesce(metro, '') ilike $${idx} or coalesce(zip, '') ilike $${idx} or coalesce(contact_name, '') ilike $${idx} or coalesce(contact_email, '') ilike $${idx} or coalesce(phone, '') ilike $${idx} or coalesce(website_url, '') ilike $${idx} or coalesce(address, '') ilike $${idx})`
    );
    values.push(`%${q.trim()}%`);
  }

  // Demo-site ICP: tier A/B only (missing/outdated sites). Hide polished + corporate rejects.
  if (view === "leads") {
    conditions.push(`(tier is null or tier in ('A', 'B'))`);
    const chainExclude = chainLocationExcludeClause(values.length + 1);
    conditions.push(chainExclude.sql);
    values.push(...chainExclude.values);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return { where, values };
}

export async function getPeopleCounts(): Promise<{ leads: number; customers: number }> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureLeadCrmSchema(pool);
    const { rows } = await pool.query<{ leads: number; customers: number }>(`
      select
        count(*) filter (where status <> 'closed_won')::int as leads,
        count(*) filter (where status = 'closed_won')::int as customers
      from leads
    `);
    return rows[0] ?? { leads: 0, customers: 0 };
  } finally {
    await pool.end();
  }
}

export async function getPipelineSummary(filters: LeadListFilters = {}): Promise<PipelineSummary> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureLeadCrmSchema(pool);
    const { where, values } = leadFilterClause(filters);
    const { rows } = await pool.query<{
      total: number;
      pending: number;
      complete: number;
      failed: number;
    }>(
      `select
         count(*)::int as total,
         count(*) filter (where coalesce(analysis_status, 'pending') = 'pending')::int as pending,
         count(*) filter (where analysis_status = 'complete')::int as complete,
         count(*) filter (where analysis_status = 'failed')::int as failed
       from leads ${where}`,
      values
    );
    const r = rows[0];
    return {
      total: r?.total ?? 0,
      pending: r?.pending ?? 0,
      complete: r?.complete ?? 0,
      failed: r?.failed ?? 0,
    };
  } finally {
    await pool.end();
  }
}

export async function getLeads(filters: LeadListFilters = {}, sort?: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureLeadCrmSchema(pool);
    const view = filters.view ?? "leads";
    if (view === "customers") {
      await ensureBillingSchema(pool);
    }
    const { where, values } = leadFilterClause(filters);

    const effectiveSort = sort ?? (view === "leads" ? "grade" : "newest");
    const barBoost = view === "leads"
      ? `case
           when place_types && ARRAY['bar']::text[] then 3
           when business_name ~* '(bar|pub|tavern|saloon|lounge|taproom|brewery|dive|roadhouse)' then 2
           else 0
         end desc, `
      : "";
    const orderBy =
      effectiveSort === "grade"
        ? `${barBoost}case site_grade when 'F' then 4 when 'C' then 3 when 'B' then 2 when 'A' then 1 else 0 end desc, coalesce(opportunity_score, 0) desc, created_at desc`
        : effectiveSort === "pending"
          ? "case analysis_status when 'pending' then 2 when 'failed' then 1 else 0 end desc, created_at desc"
          : effectiveSort === "opportunity"
            ? `${barBoost}coalesce(opportunity_score, 0) desc, case site_grade when 'F' then 4 when 'C' then 3 when 'B' then 2 when 'A' then 1 else 0 end desc, created_at desc`
            : "created_at desc";

    const billingSelect =
      view === "customers"
        ? `, coalesce(inv.outstanding_cents, 0)::int as outstanding_cents,
           coalesce(inv.collected_cents, 0)::int as collected_cents,
           coalesce(inv.invoice_count, 0)::int as invoice_count`
        : `, 0::int as outstanding_cents, 0::int as collected_cents, 0::int as invoice_count`;

    const billingJoin =
      view === "customers"
        ? `left join lateral (
             select
               count(*)::int as invoice_count,
               coalesce(sum(case when i.status not in ('paid','void') then greatest(i.amount_cents - coalesce(p.paid, 0), 0) else 0 end), 0)::int as outstanding_cents,
               coalesce(sum(coalesce(p.paid, case when i.status = 'paid' then i.amount_cents else 0 end)), 0)::int as collected_cents
             from invoices i
             left join lateral (
               select coalesce(sum(amount_cents), 0)::int as paid
               from invoice_payments where invoice_id = i.id
             ) p on true
             where i.lead_id = leads.id
           ) inv on true`
        : "";

    const { rows } = await pool.query(
      `select leads.id, business_name, metro, zip, tier, status, analysis_status, analyzed_at,
              site_grade, pitch_angle, looks_modern, mobile_ready, accessibility_ok,
              has_online_ordering, has_reservations, has_real_menu,
              google_rating, google_review_count, website_url, contact_name, contact_email, phone,
              place_types, created_at
              ${billingSelect}
       from leads
       ${billingJoin}
       ${where}
       order by ${orderBy}
       limit 200`,
      values
    );
    return rows;
  } finally {
    await pool.end();
  }
}
