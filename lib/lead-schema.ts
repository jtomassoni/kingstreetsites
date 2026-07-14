import { Pool } from "pg";

let ensured = false;

/** Idempotent column adds for lead CRM fields. */
export async function ensureLeadCrmSchema(pool: Pool) {
  if (ensured) return;
  await pool.query(`
    alter table leads add column if not exists contact_email text;
    alter table leads add column if not exists contact_name text;
    alter table leads add column if not exists contact_role text;
    alter table leads add column if not exists contact_email_source text;
    alter table leads add column if not exists contact_enrichment jsonb;
    alter table leads add column if not exists barter_payments_enabled boolean not null default false;
  `);
  ensured = true;
}
