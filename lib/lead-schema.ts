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
    alter table leads add column if not exists lead_type text not null default 'location';
    alter table leads add column if not exists franchise_brand text;
    alter table leads add column if not exists franchise_location_count int not null default 0;
    alter table leads drop constraint if exists leads_lead_type_check;
    alter table leads add constraint leads_lead_type_check
      check (lead_type in ('location', 'franchise_group'));
  `);
  ensured = true;
}
