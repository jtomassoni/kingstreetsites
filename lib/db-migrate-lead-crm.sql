-- Lead CRM hygiene: contact email for outreach + manual leads
-- Run: npm run migrate:lead-crm
-- Or: node scripts/psql-with-env.mjs lib/db-migrate-lead-crm.sql

alter table leads add column if not exists contact_email text;
alter table leads add column if not exists barter_payments_enabled boolean not null default false;
