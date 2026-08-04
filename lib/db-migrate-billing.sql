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
  method text not null default 'other'
    check (method in ('card', 'check', 'cash', 'transfer', 'barter', 'other')),
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);

alter table invoice_payments drop constraint if exists invoice_payments_method_check;
alter table invoice_payments add constraint invoice_payments_method_check
  check (method in ('card', 'check', 'cash', 'transfer', 'barter', 'other'));
