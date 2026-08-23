import { Pool } from "pg";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

export type InvoiceActivityEvent = {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const INVOICE_EVENT_TYPES = [
  "invoice_created",
  "invoice_sent",
  "invoice_updated",
  "payment_recorded",
  "payment_receipt_sent",
  "payment_updated",
  "payment_deleted",
] as const;

export async function getInvoiceActivity(
  pool: Pool,
  invoiceId: string,
  leadId: string
): Promise<InvoiceActivityEvent[]> {
  await ensureOutreachSchema(pool);

  const { rows } = await pool.query<InvoiceActivityEvent>(
    `select id, event_type, title, body, metadata, created_at
     from lead_timeline_events
     where lead_id = $1
       and event_type = any($2::text[])
       and metadata->>'invoiceId' = $3
     order by created_at desc`,
    [leadId, INVOICE_EVENT_TYPES, invoiceId]
  );

  const events = rows.map((row) => ({
    ...row,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
  }));

  if (!events.some((e) => e.event_type === "invoice_created")) {
    const { rows: invoiceRows } = await pool.query<{
      created_at: string;
      invoice_number: string;
      title: string;
    }>(`select created_at, invoice_number, title from invoices where id = $1`, [invoiceId]);
    const invoice = invoiceRows[0];
    if (invoice) {
      events.push({
        id: `synthetic-created-${invoiceId}`,
        event_type: "invoice_created",
        title: "Invoice created",
        body: `${invoice.invoice_number} · ${invoice.title}`,
        metadata: null,
        created_at: invoice.created_at,
      });
    }
  }

  return events.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function invoiceActivityLabel(eventType: string): string {
  switch (eventType) {
    case "invoice_created":
      return "Created";
    case "invoice_sent":
      return "Sent";
    case "invoice_updated":
      return "Updated";
    case "payment_recorded":
      return "Payment";
    case "payment_receipt_sent":
      return "Receipt sent";
    case "payment_updated":
      return "Payment edited";
    case "payment_deleted":
      return "Payment removed";
    default:
      return "Activity";
  }
}

export function invoiceActivityDetail(event: InvoiceActivityEvent): string {
  const meta = event.metadata ?? {};
  if (event.event_type === "payment_receipt_sent" && typeof meta.to === "string") {
    const detail = event.body?.split(" → ")[0];
    return detail ? `Sent to ${meta.to} · ${detail}` : `Sent to ${meta.to}`;
  }
  if (event.event_type === "invoice_sent" && typeof meta.to === "string") {
    return `Sent to ${meta.to}${event.body ? ` · ${event.body}` : ""}`;
  }
  if (event.body?.trim()) return event.body.trim();
  return event.title;
}

export function invoiceActivityActor(event: InvoiceActivityEvent): string | null {
  const by = event.metadata?.by;
  return typeof by === "string" && by.trim() ? by.trim() : null;
}
