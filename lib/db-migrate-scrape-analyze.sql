-- Split: scrape (Places) vs analyze (site + scores)
-- Run once (loads .env for you): npm run db:migrate-scrape-analyze
-- Or from a shell where DATABASE_URL is exported: psql "$DATABASE_URL" -f lib/db-migrate-scrape-analyze.sql

alter table leads add column if not exists analysis_status text;
alter table leads add column if not exists analysis_error text;
alter table leads add column if not exists place_types text[];
alter table leads add column if not exists analyzed_at timestamptz;
alter table leads add column if not exists site_grade text;
alter table leads add column if not exists pitch_angle text;
alter table leads add column if not exists looks_modern boolean;
alter table leads add column if not exists mobile_ready boolean;
alter table leads add column if not exists accessibility_ok boolean;
alter table leads add column if not exists has_online_ordering boolean;
alter table leads add column if not exists has_reservations boolean;
alter table leads add column if not exists has_real_menu boolean;

update leads set analysis_status = coalesce(nullif(trim(analysis_status), ''), 'pending')
where analysis_status is null;

update leads
set analysis_status = 'complete', analysis_error = null
where business_viability is not null
  and web_pain is not null
  and opportunity_score is not null
  and tier is not null;

update leads set analysis_status = 'pending' where analysis_status is null;

alter table leads alter column analysis_status set default 'pending';

alter table leads drop constraint if exists leads_analysis_status_check;
alter table leads add constraint leads_analysis_status_check
  check (analysis_status in ('pending', 'complete', 'failed'));

alter table leads drop constraint if exists leads_site_grade_check;
alter table leads add constraint leads_site_grade_check
  check (site_grade in ('A','B','C','F') or site_grade is null);

alter table leads alter column analysis_status set not null;

create table if not exists analyzer_runs (
  id uuid primary key default gen_random_uuid(),
  zip text not null default 'ALL',
  metro text not null default 'ALL',
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  total int not null default 0,
  processed int not null default 0,
  inserted int not null default 0,
  current_business text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
