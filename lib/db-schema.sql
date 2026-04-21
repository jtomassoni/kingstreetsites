create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null,
  email text not null,
  website text,
  industry text not null,
  message text not null,
  status text not null default 'new',
  source text not null default 'Free Site Audit',
  created_at timestamptz not null default now()
);
