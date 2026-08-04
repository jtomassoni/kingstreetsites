-- Sprint 1 schema — King Street Sites
-- Run: psql $DATABASE_URL -f lib/db-schema.sql

create extension if not exists pgcrypto;

-- Auth.js v5 required tables
create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text,
  email text unique not null,
  "emailVerified" timestamptz,
  image text
);

create table if not exists account (
  "userId" text not null references users(id) on delete cascade,
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at int,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  primary key (provider, "providerAccountId")
);

create table if not exists session (
  "sessionToken" text primary key,
  "userId" text not null references users(id) on delete cascade,
  expires timestamptz not null
);

create table if not exists verification_token (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

-- Leads (full Sprint 1 schema)
drop table if exists leads cascade;
create table leads (
  id uuid primary key default gen_random_uuid(),
  metro text,
  zip text,
  google_place_id text unique,
  business_name text not null,
  address text,
  phone text,
  contact_email text,
  contact_name text,
  contact_role text,
  contact_email_source text,
  contact_enrichment jsonb,
  barter_payments_enabled boolean not null default false,
  website_url text,
  cuisine text,
  google_review_count int,
  google_rating numeric(3,1),
  place_types text[],
  site_grade text check (site_grade in ('A','B','C','F')),
  pitch_angle text,
  looks_modern boolean,
  mobile_ready boolean,
  accessibility_ok boolean,
  has_online_ordering boolean,
  has_reservations boolean,
  has_real_menu boolean,
  business_viability int,
  web_pain int,
  opportunity_score int,
  tier text check (tier in ('A','B','C','reject')),
  analysis_status text not null default 'pending' check (analysis_status in ('pending','complete','failed')),
  analysis_error text,
  analyzed_at timestamptz,
  status text not null default 'new' check (status in ('new','staged','reached_out','clicked','replied','closed_won','closed_lost')),
  current_screenshot_url text,
  spec_screenshot_url text,
  spec_project_slug text,
  spec_deploy_hook_url text,
  spec_live_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent in ('prospector','architect','concierge','recovery','jt')),
  action text not null,
  lead_id uuid references leads(id),
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Settings (kill switches + config)
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Prospector run tracking
create table if not exists prospector_runs (
  id uuid primary key default gen_random_uuid(),
  zip text not null,
  metro text not null,
  status text not null default 'running' check (status in ('running','complete','failed')),
  total int not null default 0,
  processed int not null default 0,
  inserted int not null default 0,
  current_business text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Analyzer run tracking (website scrape + scoring on existing leads)
create table if not exists analyzer_runs (
  id uuid primary key default gen_random_uuid(),
  zip text not null default 'ALL',
  metro text not null default 'ALL',
  status text not null default 'running' check (status in ('running','complete','failed')),
  total int not null default 0,
  processed int not null default 0,
  inserted int not null default 0,
  current_business text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Social account connection state used by Prospector
create table if not exists social_connections (
  owner_email text not null,
  platform text not null check (platform in ('instagram', 'facebook')),
  connected boolean not null default false,
  account_label text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_email, platform)
);

-- Outreach module
create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  note text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('outbound','inbound')),
  channel text not null default 'email' check (channel in ('email')),
  from_email text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  provider text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists lead_timeline_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Seed default settings
insert into settings (key, value) values
  ('external_comms', 'false'),
  ('auto_send', 'false')
on conflict (key) do nothing;

-- Billing
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  invoice_number text not null unique,
  title text not null default 'Website project',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void', 'overdue')),
  due_date date,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_lead_id_idx on invoices (lead_id);
create index if not exists invoices_status_idx on invoices (status);

create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method text not null default 'other'
    check (method in ('card', 'check', 'cash', 'transfer', 'barter', 'other')),
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);
