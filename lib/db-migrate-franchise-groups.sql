-- Franchise group leads: track multi-unit operators instead of individual chain locations
-- Run: npm run db:migrate-franchise-groups (or psql "$DATABASE_URL" -f lib/db-migrate-franchise-groups.sql)

alter table leads add column if not exists lead_type text not null default 'location';
alter table leads add column if not exists franchise_brand text;
alter table leads add column if not exists franchise_location_count int not null default 0;

alter table leads drop constraint if exists leads_lead_type_check;
alter table leads add constraint leads_lead_type_check
  check (lead_type in ('location', 'franchise_group'));

create index if not exists leads_lead_type_idx on leads (lead_type);
