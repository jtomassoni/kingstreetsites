import { Pool } from "pg";
import type { PipelineSummary } from "./pipeline-stats-strip";

export function leadFilterClause(tier?: string, status?: string): { where: string; values: string[] } {
  const conditions: string[] = [];
  const values: string[] = [];
  if (tier) {
    conditions.push(`tier = $${values.length + 1}`);
    values.push(tier);
  }
  if (status) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(status);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  return { where, values };
}

export async function getPipelineSummary(tier?: string, status?: string): Promise<PipelineSummary> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { where, values } = leadFilterClause(tier, status);
  try {
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

export async function getLeads(tier?: string, status?: string, sort?: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { where, values } = leadFilterClause(tier, status);

    const orderBy =
      sort === "grade"
        ? "case site_grade when 'F' then 4 when 'C' then 3 when 'B' then 2 when 'A' then 1 else 0 end desc, created_at desc"
        : sort === "pending"
          ? "case analysis_status when 'pending' then 2 when 'failed' then 1 else 0 end desc, created_at desc"
          : "created_at desc";

    const { rows } = await pool.query(
      `select id, business_name, metro, zip, tier, status, analysis_status, analyzed_at,
              site_grade, pitch_angle, looks_modern, mobile_ready, accessibility_ok,
              has_online_ordering, has_reservations, has_real_menu,
              google_rating, google_review_count, website_url, created_at
       from leads ${where}
       order by ${orderBy}
       limit 200`,
      values
    );
    return rows;
  } finally {
    await pool.end();
  }
}
