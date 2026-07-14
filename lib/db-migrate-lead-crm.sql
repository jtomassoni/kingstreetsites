-- Lead CRM hygiene: contact email for outreach + manual leads
-- Run: npm run migrate:lead-crm
-- Or: node scripts/psql-with-env.mjs lib/db-migrate-lead-crm.sql

alter table leads add column if not exists contact_email text;
alter table leads add column if not exists contact_name text;
alter table leads add column if not exists contact_role text;
alter table leads add column if not exists contact_email_source text;
alter table leads add column if not exists contact_enrichment jsonb;
alter table leads add column if not exists barter_payments_enabled boolean not null default false;
