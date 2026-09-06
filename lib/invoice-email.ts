import { Pool } from "pg";
import {
  buildLeadInboundReplyTo,
  isValidEmail,
  sendOutreachEmail,
} from "@/lib/outreach-email";
import {
  formatMoney,
  formatDateOnly,
  generateDueScheduledInvoices,
  type GeneratedScheduledInvoice,
  type InvoiceStatus,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

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

type PastDueBalance = {
  invoice_number: string;
  remaining_cents: number;
  currency: string;
  due_date: string | null;
};

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  return formatDateOnly(iso, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPastDueLines(items: PastDueBalance[]): string[] {
  if (items.length === 0) return [];

  function itemLabel(item: PastDueBalance): string {
    const amount = formatMoney(item.remaining_cents, item.currency);
    const due = formatDueDate(item.due_date);
    return due ? `${item.invoice_number} — ${amount} (due ${due})` : `${item.invoice_number} — ${amount}`;
  }

  if (items.length === 1) {
    const item = items[0];
    const amount = formatMoney(item.remaining_cents, item.currency);
    const due = formatDueDate(item.due_date);
    const dueBit = due ? ` (due ${due})` : "";
    return [`You also have ${amount} past due on invoice ${item.invoice_number}${dueBit}.`];
  }

  const sameCurrency = items.every((item) => item.currency === items[0].currency);
  const total = items.reduce((sum, item) => sum + item.remaining_cents, 0);
  const lines = [
    sameCurrency
      ? `You also have ${formatMoney(total, items[0].currency)} past due on other invoices:`
      : "You also have past-due balances on other invoices:",
  ];
  for (const item of items) lines.push(itemLabel(item));
  return lines;
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
  opts: { comments?: string | null; pastDue?: PastDueBalance[] } = {}
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

  const pastDueLines = formatPastDueLines(opts.pastDue ?? []);
  if (pastDueLines.length) {
    lines.push("", ...pastDueLines);
  }

  lines.push(
    "",
    "Reply to this email if you have any questions or need to arrange payment.",
    "",
    "Thank you,",
    "James T",
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
    `select id, lead_id, invoice_number, title, amount_cents, currency, status, due_date::text as due_date, notes
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

  const { rows: pastDueRows } = await pool.query<PastDueBalance>(
    `select
       i.invoice_number,
       i.currency,
       i.due_date::text as due_date,
       greatest(i.amount_cents - p.paid, 0)::int as remaining_cents
     from invoices i
     left join lateral (
       select coalesce(sum(amount_cents), 0)::int as paid
       from invoice_payments
       where invoice_id = i.id
     ) p on true
     where i.lead_id = $1
       and i.id <> $2
       and i.status not in ('draft', 'paid', 'void')
       and i.amount_cents > p.paid
       and (
         i.status = 'overdue'
         or (i.due_date is not null and i.due_date < current_date)
       )
     order by i.due_date asc nulls last, i.invoice_number asc`,
    [invoice.lead_id, invoiceId]
  );

  return { invoice, lead, to, paidCents, pastDue: pastDueRows };
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
  const { invoice, lead, to, paidCents, pastDue } = await loadInvoiceEmailContext(pool, invoiceId);
  assertInvoiceCanBeSent(invoice, to);

  const comments =
    typeof opts.comments === "string" && opts.comments.trim() ? opts.comments.trim() : null;
  const { subject, message } = buildInvoiceEmailText(invoice, paidCents, lead, { comments, pastDue });

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
  const { invoice, lead, to, paidCents, pastDue } = await loadInvoiceEmailContext(pool, invoiceId);
  assertInvoiceCanBeSent(invoice, to);

  const comments =
    typeof opts.comments === "string" && opts.comments.trim() ? opts.comments.trim() : null;
  const { subject, message } = buildInvoiceEmailText(invoice, paidCents, lead, { comments, pastDue });
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

export async function autoSendGeneratedInvoices(
  pool: Pool,
  generated: GeneratedScheduledInvoice[],
  opts: { by?: string } = {}
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const by = opts.by ?? "system";

  for (const item of generated) {
    if (!item.autoSend) continue;
    try {
      await sendInvoiceEmail(pool, item.invoiceId, { by });
      sent += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Failed to auto-send invoice";
      await pool.query(
        `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
         values ($1, 'invoice_send_failed', 'Invoice auto-send failed', $2, $3::jsonb)`,
        [
          item.leadId,
          message,
          JSON.stringify({
            invoiceId: item.invoiceId,
            scheduleId: item.scheduleId,
            error: message,
            by,
          }),
        ]
      );
    }
  }

  return { sent, failed };
}

/** Generate due recurring invoices and email any with auto-send enabled. */
export async function processDueScheduledInvoices(
  pool: Pool,
  opts: { leadId?: string; createdBy?: string } = {}
): Promise<{ created: number; sent: number; failed: number }> {
  await ensureOutreachSchema(pool);
  const generated = await generateDueScheduledInvoices(pool, opts);
  const sendResult = await autoSendGeneratedInvoices(pool, generated, {
    by: opts.createdBy ?? "system",
  });
  return {
    created: generated.length,
    sent: sendResult.sent,
    failed: sendResult.failed,
  };
}
