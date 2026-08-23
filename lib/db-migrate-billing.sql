-- Billing for customers / leads
-- Run: npm run migrate:billing

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
  method text not null default 'card'
    check (method in ('card', 'check', 'cash', 'barter')),
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);

alter table invoice_payments drop constraint if exists invoice_payments_method_check;
update invoice_payments set method = 'card' where method in ('transfer', 'other');
alter table invoice_payments alter column method set default 'card';
alter table invoice_payments add constraint invoice_payments_method_check
  check (method in ('card', 'check', 'cash', 'barter'));

create table if not exists invoice_schedules (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null default 'Website project',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  notes text,
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'yearly')),
  next_run_on date not null,
  end_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_schedules_lead_id_idx on invoice_schedules (lead_id);
create index if not exists invoice_schedules_next_run_idx
  on invoice_schedules (next_run_on) where active = true;

alter table invoices add column if not exists schedule_id uuid references invoice_schedules(id) on delete set null;
create index if not exists invoices_schedule_id_idx on invoices (schedule_id);

alter table invoice_payments add column if not exists receipts jsonb not null default '[]'::jsonb;

create table if not exists invoice_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  notes text,
  recurring boolean not null default false,
  frequency text check (frequency is null or frequency in ('weekly', 'monthly', 'yearly')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_templates_sort_idx on invoice_templates (sort_order, name);

insert into invoice_templates (name, title, amount_cents, notes, recurring, frequency, sort_order)
select v.name, v.title, v.amount_cents, v.notes, v.recurring, v.frequency, v.sort_order
from (values
  (
    '$99/mo Starter',
    'Website hosting — Starter',
    9900,
    'Monthly hosting and basic content updates.',
    false,
    null,
    1
  ),
  (
    '$199/mo Pro',
    'Website hosting — Pro',
    19900,
    'Monthly hosting, content edits, and priority support.',
    false,
    null,
    2
  )
) as v(name, title, amount_cents, notes, recurring, frequency, sort_order)
where not exists (
  select 1 from invoice_templates t where t.name = v.name
);
