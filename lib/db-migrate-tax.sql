-- Business expenses for solo-prop tax / Schedule C tracking
-- Run: node scripts/psql-with-env.mjs lib/db-migrate-tax.sql

create table if not exists business_expenses (
  id uuid primary key default gen_random_uuid(),
  incurred_on date not null,
  category text not null
    check (category in (
      'equipment', 'hosting_software', 'office', 'advertising',
      'professional', 'travel', 'utilities', 'other'
    )),
  description text not null,
  vendor text,
  amount_cents int not null check (amount_cents > 0),
  recurring boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_expenses_incurred_on_idx
  on business_expenses (incurred_on desc);
create index if not exists business_expenses_category_idx
  on business_expenses (category);
