import { Pool } from "pg";
import {
  buildLeadInboundReplyTo,
  isValidEmail,
  sendOutreachEmail,
} from "@/lib/outreach-email";
import { formatMoney, formatDateOnly, type InvoiceStatus } from "@/lib/billing";

type InvoiceRow = {
  id: string;
  lead_id: string;
  invoice_number: string;
  title: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
};

type LeadRow = {
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
};

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  return formatDateOnly(iso, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function greeting(lead: LeadRow): string {
  const name = lead.contact_name?.trim();
  if (name) return `Hi ${name},`;
  if (lead.business_name?.trim()) return `Hi there,`;
  return "Hi,";
}

export function buildInvoiceEmailText(
  invoice: InvoiceRow,
  paidCents: number,
  lead: LeadRow,
  opts: { comments?: string | null } = {}
): { subject: string; message: string } {
  const remaining = Math.max(0, invoice.amount_cents - paidCents);
  const dueLabel = formatDueDate(invoice.due_date);
  const subject = `Invoice ${invoice.invoice_number} — ${invoice.title}`;

  const lines = [
    greeting(lead),
    "",
    `Please find your invoice below for ${invoice.title}.`,
  ];

  if (opts.comments?.trim()) {
    lines.push("", opts.comments.trim());
  }

  lines.push(
    "",
    `Invoice: ${invoice.invoice_number}`,
    `Amount: ${formatMoney(invoice.amount_cents, invoice.currency)}`,
  );

  if (paidCents > 0) {
    lines.push(`Paid: ${formatMoney(paidCents, invoice.currency)}`);
    lines.push(`Balance due: ${formatMoney(remaining, invoice.currency)}`);
  } else {
    lines.push(`Amount due: ${formatMoney(remaining, invoice.currency)}`);
  }

  if (dueLabel) {
    lines.push(`Due date: ${dueLabel}`);
  }

  if (invoice.notes?.trim()) {
    lines.push("", invoice.notes.trim());
  }

  lines.push(
    "",
    "Reply to this email if you have any questions or need to arrange payment.",
    "",
    "Thank you,",
    "King Street Sites"
  );

  return { subject, message: lines.join("\n") };
}

/** Sample invoice email for template editing — not tied to a real lead. */
export function buildInvoiceEmailPreviewFromTemplate(opts: {
  title: string;
  amountCents: number;
  notes?: string | null;
  dueDate?: string | null;
  contactName?: string | null;
}): { subject: string; message: string } {
  const invoice: InvoiceRow = {
    id: "preview",
    lead_id: "preview",
    invoice_number: "KSS-2026-0000",
    title: opts.title.trim() || "Website project",
    amount_cents: opts.amountCents,
    currency: "usd",
    status: "draft",
    due_date: opts.dueDate ?? null,
    notes: opts.notes ?? null,
  };
  const lead: LeadRow = {
    business_name: null,
    contact_name: opts.contactName?.trim() || "Customer",
    contact_email: "customer@example.com",
  };
  return buildInvoiceEmailText(invoice, 0, lead);
}

async function loadInvoiceEmailContext(pool: Pool, invoiceId: string) {
  const { rows: invoiceRows } = await pool.query<InvoiceRow>(
    `select id, lead_id, invoice_number, title, amount_cents, currency, status, due_date, notes
     from invoices where id = $1`,
    [invoiceId]
  );
  const invoice = invoiceRows[0];
  if (!invoice) {
    throw new InvoiceSendError("Invoice not found", "not_found", 404);
  }

  const { rows: leadRows } = await pool.query<LeadRow>(
    `select business_name, contact_name, contact_email from leads where id = $1`,
    [invoice.lead_id]
  );
  const lead = leadRows[0];
  const to = lead?.contact_email?.trim() ?? "";

  const paidRes = await pool.query<{ paid: number }>(
    `select coalesce(sum(amount_cents), 0)::int as paid from invoice_payments where invoice_id = $1`,
    [invoiceId]
  );
  const paidCents = paidRes.rows[0]?.paid ?? 0;

  return { invoice, lead, to, paidCents };
}

function assertInvoiceCanBeSent(invoice: InvoiceRow, to: string) {
  if (invoice.status === "void") {
    throw new InvoiceSendError("Cannot send a void invoice", "void");
  }
  if (invoice.status === "paid") {
    throw new InvoiceSendError("Invoice is already paid", "paid");
  }
  if (!to || !isValidEmail(to)) {
    throw new InvoiceSendError(
      "Lead has no valid contact email — add one in the lead profile first",
      "no_email",
      422
    );
  }
}

export async function getInvoiceEmailDraft(
  pool: Pool,
  invoiceId: string,
  opts: { comments?: string | null } = {}
) {
  const { invoice, lead, to, paidCents } = await loadInvoiceEmailContext(pool, invoiceId);
  assertInvoiceCanBeSent(invoice, to);

  const comments =
    typeof opts.comments === "string" && opts.comments.trim() ? opts.comments.trim() : null;
  const { subject, message } = buildInvoiceEmailText(invoice, paidCents, lead, { comments });

  return {
    to,
    subject,
    message,
    invoiceNumber: invoice.invoice_number,
    isResend: invoice.status !== "draft",
  };
}

export class InvoiceSendError extends Error {
  code: "not_found" | "no_email" | "void" | "paid" | "send_failed";
  status: number;

  constructor(message: string, code: InvoiceSendError["code"], status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function sendInvoiceEmail(
  pool: Pool,
  invoiceId: string,
  opts: { by?: string; comments?: string | null } = {}
): Promise<{ messageId: string | null; to: string }> {
  const { invoice, lead, to, paidCents } = await loadInvoiceEmailContext(pool, invoiceId);
  assertInvoiceCanBeSent(invoice, to);

  const comments =
    typeof opts.comments === "string" && opts.comments.trim() ? opts.comments.trim() : null;
  const { subject, message } = buildInvoiceEmailText(invoice, paidCents, lead, { comments });
  const inboundReplyTo = buildLeadInboundReplyTo(invoice.lead_id);

  let sent: { id: string | null; fromEmail: string; from: string };
  try {
    sent = await sendOutreachEmail({ to, subject, message, replyTo: inboundReplyTo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send invoice email";
    const status =
      msg.includes("not verified") || msg.includes("not added") || msg.includes("resend.dev")
        ? 422
        : 502;
    throw new InvoiceSendError(msg, "send_failed", status);
  }

  if (invoice.status === "draft") {
    await pool.query(
      `update invoices set status = 'sent', updated_at = now() where id = $1`,
      [invoiceId]
    );
  }

  await pool.query(
    `insert into lead_messages
      (lead_id, direction, channel, from_email, to_email, subject, body_text, provider, provider_message_id)
     values ($1, 'outbound', 'email', $2, $3, $4, $5, 'resend', $6)`,
    [invoice.lead_id, sent.fromEmail, to, subject, message, sent.id]
  );

  await pool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'invoice_sent', 'Invoice sent', $2, $3::jsonb)`,
    [
      invoice.lead_id,
      `${invoice.invoice_number} · ${formatMoney(invoice.amount_cents, invoice.currency)}`,
      JSON.stringify({
        invoiceId,
        invoiceNumber: invoice.invoice_number,
        to,
        providerMessageId: sent.id,
        comments,
        by: opts.by ?? "unknown",
      }),
    ]
  );

  return { messageId: sent.id, to };
}
