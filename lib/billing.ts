import { Pool } from "pg";

let billingSchemaEnsured = false;
let billingSchemaEnsuring: Promise<void> | null = null;

async function runEnsureBillingSchema(pool: Pool) {
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
      method text not null default 'card'
        check (method in ('card', 'check', 'cash', 'barter')),
      paid_at timestamptz not null default now(),
      notes text,
      created_at timestamptz not null default now()
    );

    create index if not exists invoice_payments_invoice_id_idx on invoice_payments (invoice_id);

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
  `);

  await pool.query(`
    update invoice_payments set method = 'card' where method in ('transfer', 'other');

    alter table invoice_payments drop constraint if exists invoice_payments_method_check;
    alter table invoice_payments alter column method set default 'card';
    alter table invoice_payments add constraint invoice_payments_method_check
      check (method in ('card', 'check', 'cash', 'barter'));

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
  `);

  await pool.query(`
    insert into invoice_templates (name, title, amount_cents, notes, recurring, frequency, sort_order)
    select v.name, v.title, v.amount_cents, v.notes, v.recurring, v.frequency, v.sort_order
    from (values
      (
        '$99/mo Starter'::text,
        'Website hosting — Starter'::text,
        9900::int,
        'Monthly hosting and basic content updates.'::text,
        false,
        null::text,
        1::int
      ),
      (
        '$199/mo Pro'::text,
        'Website hosting — Pro'::text,
        19900::int,
        'Monthly hosting, content edits, and priority support.'::text,
        false,
        null::text,
        2::int
      )
    ) as v(name, title, amount_cents, notes, recurring, frequency, sort_order)
    where not exists (
      select 1 from invoice_templates t where t.name = v.name
    );
  `);

  billingSchemaEnsured = true;
}

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void", "overdue"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
};

export const PAYMENT_METHODS = ["card", "check", "cash", "barter"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Card",
  check: "Check",
  cash: "Cash",
  barter: "Barter",
};

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export async function ensureBillingSchema(pool: Pool) {
  if (billingSchemaEnsured) return;
  if (!billingSchemaEnsuring) {
    billingSchemaEnsuring = runEnsureBillingSchema(pool).finally(() => {
      billingSchemaEnsuring = null;
    });
  }
  await billingSchemaEnsuring;
}

/** YYYY-MM-DD in local calendar math from a date-only string. */
export function advanceRecurringDate(
  isoDate: string,
  frequency: RecurringFrequency
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, daysInMonth));
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Create draft invoices for any active schedules that are due (lazy cron). */
export async function generateDueScheduledInvoices(
  pool: Pool,
  opts: { leadId?: string; createdBy?: string } = {}
): Promise<number> {
  await ensureBillingSchema(pool);
  const today = todayIsoDate();
  const params: unknown[] = [today];
  let leadFilter = "";
  if (opts.leadId) {
    params.push(opts.leadId);
    leadFilter = ` and lead_id = $2`;
  }

  const { rows: schedules } = await pool.query<{
    id: string;
    lead_id: string;
    title: string;
    amount_cents: number;
    currency: string;
    notes: string | null;
    frequency: RecurringFrequency;
    next_run_on: string;
    end_on: string | null;
  }>(
    `select id, lead_id, title, amount_cents, currency, notes, frequency,
            next_run_on::text, end_on::text
     from invoice_schedules
     where active = true
       and next_run_on <= $1::date
       ${leadFilter}
     order by next_run_on asc
     limit 50`,
    params
  );

  let created = 0;
  for (const schedule of schedules) {
    let nextRun = schedule.next_run_on.slice(0, 10);
    // Catch up if the app wasn't opened for a while (cap per schedule).
    for (let i = 0; i < 24 && nextRun <= today; i++) {
      if (schedule.end_on && nextRun > schedule.end_on.slice(0, 10)) {
        await pool.query(
          `update invoice_schedules set active = false, updated_at = now() where id = $1`,
          [schedule.id]
        );
        break;
      }

      const invoiceNumber = await nextInvoiceNumber(pool);
      const { rows } = await pool.query(
        `insert into invoices
          (lead_id, invoice_number, title, amount_cents, currency, status, due_date, notes, schedule_id)
         values ($1, $2, $3, $4, $5, 'draft', $6, $7, $8)
         returning id`,
        [
          schedule.lead_id,
          invoiceNumber,
          schedule.title,
          schedule.amount_cents,
          schedule.currency,
          nextRun,
          schedule.notes,
          schedule.id,
        ]
      );

      await pool.query(
        `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
         values ($1, 'invoice_created', 'Recurring invoice created', $2, $3::jsonb)`,
        [
          schedule.lead_id,
          `${invoiceNumber} · ${schedule.title}`,
          JSON.stringify({
            invoiceId: rows[0].id,
            scheduleId: schedule.id,
            amountCents: schedule.amount_cents,
            recurring: true,
            by: opts.createdBy ?? "system",
          }),
        ]
      );

      created += 1;
      nextRun = advanceRecurringDate(nextRun, schedule.frequency);

      if (schedule.end_on && nextRun > schedule.end_on.slice(0, 10)) {
        await pool.query(
          `update invoice_schedules
           set next_run_on = $2, active = false, updated_at = now()
           where id = $1`,
          [schedule.id, nextRun]
        );
        break;
      }

      await pool.query(
        `update invoice_schedules
         set next_run_on = $2, updated_at = now()
         where id = $1`,
        [schedule.id, nextRun]
      );
    }
  }

  return created;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Calendar YYYY-MM-DD from a Postgres `date`, Date, or ISO string.
 * node-pg returns DATE columns as Date (local midnight); Next.js client props need strings.
 */
export function toDateOnlyString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? match[0] : null;
}

/** JSON-serialize pg rows so Date fields can cross the Server → Client Component boundary. */
export function serializeForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Format a Postgres `date` / YYYY-MM-DD string for display.
 * Avoids `new Date("YYYY-MM-DD")` which is UTC midnight and shifts a day in US timezones.
 */
export function formatDateOnly(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric", year: "numeric" }
): string {
  const iso = toDateOnlyString(value);
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
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

export async function syncInvoiceStatusFromPayments(pool: Pool, invoiceId: string) {
  const invoiceRes = await pool.query(`select * from invoices where id = $1`, [invoiceId]);
  const invoice = invoiceRes.rows[0];
  if (!invoice || invoice.status === "void") return invoice?.status ?? null;

  const paidSum = await pool.query<{ paid: number }>(
    `select coalesce(sum(amount_cents), 0)::int as paid from invoice_payments where invoice_id = $1`,
    [invoiceId]
  );
  const paid = paidSum.rows[0]?.paid ?? 0;

  let nextStatus: InvoiceStatus = invoice.status;
  if (paid >= invoice.amount_cents) {
    nextStatus = "paid";
  } else if (paid > 0) {
    nextStatus = invoice.status === "draft" ? "sent" : invoice.status === "paid" ? "sent" : invoice.status;
  } else if (invoice.status === "paid") {
    nextStatus = "sent";
  }

  await pool.query(
    `update invoices
     set status = $2,
         paid_at = case when $2 = 'paid' then coalesce(paid_at, now()) else null end,
         updated_at = now()
     where id = $1`,
    [invoiceId, nextStatus]
  );

  return nextStatus;
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
