import { Pool } from "pg";
import {
  buildLeadInboundReplyTo,
  isValidEmail,
  sendOutreachEmail,
} from "@/lib/outreach-email";
import {
  formatMoney,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "@/lib/billing";

type InvoiceRow = {
  id: string;
  lead_id: string;
  invoice_number: string;
  title: string;
  amount_cents: number;
  currency: string;
};

type LeadRow = {
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
};

type PaymentRow = {
  id: string;
  amount_cents: number;
  method: string;
  paid_at: string | Date;
  notes: string | null;
};

function greeting(lead: LeadRow): string {
  const name = lead.contact_name?.trim();
  if (name) return `Hi ${name},`;
  if (lead.business_name?.trim()) return `Hi there,`;
  return "Hi,";
}

function formatPaymentDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildPaymentReceiptEmailText(
  invoice: InvoiceRow,
  payment: PaymentRow,
  lead: LeadRow,
  totalPaidCents: number
): { subject: string; message: string } {
  const remaining = Math.max(0, invoice.amount_cents - totalPaidCents);
  const methodLabel =
    PAYMENT_METHOD_LABEL[payment.method as PaymentMethod] ?? payment.method;
  const subject = `Payment receipt — ${invoice.invoice_number}`;

  const lines = [
    greeting(lead),
    "",
    "Thank you — we've received your payment.",
    "",
    `Payment: ${formatMoney(payment.amount_cents, invoice.currency)} via ${methodLabel}`,
    `Date: ${formatPaymentDate(payment.paid_at)}`,
    `Invoice: ${invoice.invoice_number} · ${invoice.title}`,
    "",
    `Invoice total: ${formatMoney(invoice.amount_cents, invoice.currency)}`,
    `Total paid: ${formatMoney(totalPaidCents, invoice.currency)}`,
    remaining > 0
      ? `Balance due: ${formatMoney(remaining, invoice.currency)}`
      : "Balance due: $0.00 — paid in full",
  ];

  if (payment.notes?.trim()) {
    lines.push("", payment.notes.trim());
  }

  lines.push(
    "",
    "Reply to this email if you have any questions.",
    "",
    "Thank you,",
    "King Street Sites"
  );

  return { subject, message: lines.join("\n") };
}

export type PaymentReceiptSendResult =
  | { sent: true; to: string; messageId: string | null }
  | { sent: false; reason: "no_email" | "send_failed"; error?: string };

export async function sendPaymentReceiptEmail(
  pool: Pool,
  invoiceId: string,
  paymentId: string,
  opts: { by?: string; totalPaidCents: number }
): Promise<PaymentReceiptSendResult> {
  const { rows: invoiceRows } = await pool.query<InvoiceRow>(
    `select id, lead_id, invoice_number, title, amount_cents, currency
     from invoices where id = $1`,
    [invoiceId]
  );
  const invoice = invoiceRows[0];
  if (!invoice) {
    return { sent: false, reason: "send_failed", error: "Invoice not found" };
  }

  const { rows: paymentRows } = await pool.query<PaymentRow>(
    `select id, amount_cents, method, paid_at, notes
     from invoice_payments
     where id = $1 and invoice_id = $2`,
    [paymentId, invoiceId]
  );
  const payment = paymentRows[0];
  if (!payment) {
    return { sent: false, reason: "send_failed", error: "Payment not found" };
  }

  const { rows: leadRows } = await pool.query<LeadRow>(
    `select business_name, contact_name, contact_email from leads where id = $1`,
    [invoice.lead_id]
  );
  const lead = leadRows[0];
  const to = lead?.contact_email?.trim() ?? "";
  if (!to || !isValidEmail(to)) {
    return { sent: false, reason: "no_email" };
  }

  const totalPaidCents = opts.totalPaidCents;
  const { subject, message } = buildPaymentReceiptEmailText(
    invoice,
    payment,
    lead,
    totalPaidCents
  );
  const inboundReplyTo = buildLeadInboundReplyTo(invoice.lead_id);

  try {
    const sent = await sendOutreachEmail({ to, subject, message, replyTo: inboundReplyTo });

    await pool.query(
      `insert into lead_messages
        (lead_id, direction, channel, from_email, to_email, subject, body_text, provider, provider_message_id)
       values ($1, 'outbound', 'email', $2, $3, $4, $5, 'resend', $6)`,
      [invoice.lead_id, sent.fromEmail, to, subject, message, sent.id]
    );

    await pool.query(
      `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
       values ($1, 'payment_receipt_sent', 'Payment receipt sent', $2, $3::jsonb)`,
      [
        invoice.lead_id,
        `${invoice.invoice_number} · ${formatMoney(payment.amount_cents, invoice.currency)} → ${to}`,
        JSON.stringify({
          invoiceId,
          paymentId,
          invoiceNumber: invoice.invoice_number,
          amountCents: payment.amount_cents,
          to,
          providerMessageId: sent.id,
          by: opts.by ?? "unknown",
        }),
      ]
    );

    return { sent: true, to, messageId: sent.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to send payment receipt";
    return { sent: false, reason: "send_failed", error };
  }
}
