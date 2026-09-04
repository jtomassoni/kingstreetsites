import type { Pool } from "pg";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/billing";

let taxSchemaEnsured = false;
let taxSchemaEnsuring: Promise<void> | null = null;

export const EXPENSE_CATEGORIES = [
  "equipment",
  "hosting_software",
  "office",
  "advertising",
  "professional",
  "travel",
  "utilities",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  equipment: "Equipment (laptop, peripherals)",
  hosting_software: "Hosting & software",
  office: "Office supplies",
  advertising: "Advertising & marketing",
  professional: "Professional services",
  travel: "Travel",
  utilities: "Utilities / phone / internet",
  other: "Other",
};

export type BusinessExpense = {
  id: string;
  incurred_on: string;
  category: ExpenseCategory;
  description: string;
  vendor: string | null;
  amount_cents: number;
  recurring: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxIncomeRow = {
  payment_id: string;
  paid_at: string;
  amount_cents: number;
  method: PaymentMethod;
  notes: string | null;
  invoice_id: string;
  invoice_number: string;
  invoice_title: string;
  lead_id: string;
  business_name: string;
};

export type TaxYearSummary = {
  year: number;
  income_cash_cents: number;
  income_barter_cents: number;
  income_total_cents: number;
  expenses_cents: number;
  net_cents: number;
  income_rows: TaxIncomeRow[];
  expense_rows: BusinessExpense[];
  expenses_by_category: { category: ExpenseCategory; amount_cents: number }[];
};

async function runEnsureTaxSchema(pool: Pool) {
  await pool.query(`
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
  `);
  taxSchemaEnsured = true;
}

export async function ensureTaxSchema(pool: Pool) {
  if (taxSchemaEnsured) return;
  if (!taxSchemaEnsuring) {
    taxSchemaEnsuring = runEnsureTaxSchema(pool).finally(() => {
      taxSchemaEnsuring = null;
    });
  }
  await taxSchemaEnsuring;
}

export function availableTaxYears(now = new Date()): number[] {
  const current = now.getFullYear();
  return [current, current - 1, current - 2, current - 3];
}

export async function getTaxYearSummary(pool: Pool, year: number): Promise<TaxYearSummary> {
  await ensureTaxSchema(pool);

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const incomeRes = await pool.query<TaxIncomeRow>(
    `select
       p.id as payment_id,
       coalesce(p.paid_at, p.created_at)::date::text as paid_at,
       p.amount_cents,
       p.method,
       p.notes,
       i.id as invoice_id,
       i.invoice_number,
       i.title as invoice_title,
       l.id as lead_id,
       l.business_name
     from invoice_payments p
     join invoices i on i.id = p.invoice_id
     join leads l on l.id = i.lead_id
     where i.status <> 'void'
       and coalesce(p.paid_at, p.created_at)::date >= $1::date
       and coalesce(p.paid_at, p.created_at)::date <= $2::date
     order by coalesce(p.paid_at, p.created_at) asc, p.id asc`,
    [start, end]
  );

  const expenseRes = await pool.query<BusinessExpense>(
    `select
       id,
       incurred_on::text as incurred_on,
       category,
       description,
       vendor,
       amount_cents,
       recurring,
       notes,
       created_at::text as created_at,
       updated_at::text as updated_at
     from business_expenses
     where incurred_on >= $1::date
       and incurred_on <= $2::date
     order by incurred_on desc, created_at desc`,
    [start, end]
  );

  const income_rows = incomeRes.rows;
  const expense_rows = expenseRes.rows;

  let income_cash_cents = 0;
  let income_barter_cents = 0;
  for (const row of income_rows) {
    if (row.method === "barter") income_barter_cents += row.amount_cents;
    else income_cash_cents += row.amount_cents;
  }

  const expenses_cents = expense_rows.reduce((sum, e) => sum + e.amount_cents, 0);
  const income_total_cents = income_cash_cents + income_barter_cents;

  const byCat = new Map<ExpenseCategory, number>();
  for (const e of expense_rows) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount_cents);
  }

  return {
    year,
    income_cash_cents,
    income_barter_cents,
    income_total_cents,
    expenses_cents,
    net_cents: income_total_cents - expenses_cents,
    income_rows,
    expense_rows,
    expenses_by_category: EXPENSE_CATEGORIES.filter((c) => byCat.has(c)).map((category) => ({
      category,
      amount_cents: byCat.get(category) ?? 0,
    })),
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Solo-prop Schedule C–oriented export (includes barter FMV as gross receipts). */
export function buildTaxYearCsv(summary: TaxYearSummary): string {
  const lines: string[] = [];
  const push = (cols: (string | number | null | undefined)[]) => {
    lines.push(cols.map(csvEscape).join(","));
  };

  push(["King Street Sites — Tax year export"]);
  push(["Entity", "Sole proprietorship (Schedule C)"]);
  push(["Tax year", summary.year]);
  push([
    "Note",
    "Barter income is included at fair market value in gross receipts (IRS Pub 525 / Schedule C).",
  ]);
  push([]);

  push(["SUMMARY"]);
  push(["Gross receipts — cash / card / check", (summary.income_cash_cents / 100).toFixed(2)]);
  push(["Gross receipts — barter (FMV)", (summary.income_barter_cents / 100).toFixed(2)]);
  push(["Gross receipts — total (Schedule C line 1)", (summary.income_total_cents / 100).toFixed(2)]);
  push(["Business expenses — total", (summary.expenses_cents / 100).toFixed(2)]);
  push(["Approximate net (receipts − expenses)", (summary.net_cents / 100).toFixed(2)]);
  push([]);

  push(["EXPENSES BY CATEGORY"]);
  push(["Category", "Amount"]);
  for (const row of summary.expenses_by_category) {
    push([EXPENSE_CATEGORY_LABEL[row.category], (row.amount_cents / 100).toFixed(2)]);
  }
  push([]);

  push(["INCOME DETAIL"]);
  push([
    "Date",
    "Client",
    "Invoice",
    "Title",
    "Method",
    "Amount",
    "Barter / notes",
  ]);
  for (const row of summary.income_rows) {
    push([
      row.paid_at.slice(0, 10),
      row.business_name,
      row.invoice_number,
      row.invoice_title,
      PAYMENT_METHOD_LABEL[row.method] ?? row.method,
      (row.amount_cents / 100).toFixed(2),
      row.notes,
    ]);
  }
  push([]);

  push(["EXPENSE DETAIL"]);
  push(["Date", "Category", "Description", "Vendor", "Recurring", "Amount", "Notes"]);
  for (const row of summary.expense_rows) {
    push([
      row.incurred_on.slice(0, 10),
      EXPENSE_CATEGORY_LABEL[row.category] ?? row.category,
      row.description,
      row.vendor,
      row.recurring ? "yes" : "no",
      (row.amount_cents / 100).toFixed(2),
      row.notes,
    ]);
  }

  return `${lines.join("\n")}\n`;
}
