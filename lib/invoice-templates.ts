import { Pool } from "pg";
import { dollarsToCents, ensureBillingSchema } from "@/lib/billing";

export type InvoiceTemplate = {
  id: string;
  name: string;
  title: string;
  amount_cents: number;
  currency: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function ensureInvoiceTemplatesSchema(pool: Pool) {
  await ensureBillingSchema(pool);
}

export async function listInvoiceTemplates(pool: Pool): Promise<InvoiceTemplate[]> {
  await ensureInvoiceTemplatesSchema(pool);
  const { rows } = await pool.query<InvoiceTemplate>(
    `select id, name, title, amount_cents, currency, notes, sort_order, created_at, updated_at
     from invoice_templates
     order by sort_order asc, name asc`
  );
  return rows;
}

export function parseTemplateAmountDollars(value: unknown): number | null {
  const amountDollars = Number(value);
  if (!Number.isFinite(amountDollars) || amountDollars < 0) return null;
  return amountDollars;
}

export function templateToCreateFields(template: InvoiceTemplate) {
  return {
    title: template.title,
    amount: (template.amount_cents / 100).toFixed(2),
    notes: template.notes ?? "",
  };
}

export { dollarsToCents };
