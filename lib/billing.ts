import { Pool } from "pg";

let ensured = false;

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void", "overdue"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
};

export const PAYMENT_METHODS = ["card", "check", "cash", "transfer", "barter", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Card",
  check: "Check",
  cash: "Cash",
  transfer: "Transfer",
  barter: "Bar tab",
  other: "Other",
};

/** Payment methods shown when barter is disabled for a lead. */
export const STANDARD_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m !== "barter");

export async function ensureBillingSchema(pool: Pool) {
  if (ensured) return;

  await pool.query(`
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
        check (method in ('card', 'check', 'cash', 'transfer', 'other')),
      paid_at timestamptz not null default now(),
      notes text,
      created_at timestamptz not null default now()
    );

    create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);
  `);

  await pool.query(`
    alter table invoice_payments drop constraint if exists invoice_payments_method_check;
    alter table invoice_payments add constraint invoice_payments_method_check
      check (method in ('card', 'check', 'cash', 'transfer', 'barter', 'other'));
  `);

  ensured = true;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export async function nextInvoiceNumber(pool: Pool): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KSS-${year}-`;
  const { rows } = await pool.query<{ invoice_number: string }>(
    `select invoice_number from invoices
     where invoice_number like $1
     order by invoice_number desc
     limit 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.invoice_number;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(4, "0")}`;
}
