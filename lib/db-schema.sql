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
  website_url text,
  cuisine text,
  google_review_count int,
  google_rating numeric(3,1),
  business_viability int,
  web_pain int,
  opportunity_score int,
  tier text check (tier in ('A','B','C','reject')),
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

-- Seed default settings
insert into settings (key, value) values
  ('external_comms', 'false'),
  ('auto_send', 'false')
on conflict (key) do nothing;
