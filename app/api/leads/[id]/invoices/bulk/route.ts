import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  INVOICE_STATUSES,
  type InvoiceStatus,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { InvoiceSendError, sendInvoiceEmail } from "@/lib/invoice-email";

type BulkAction = "resend" | "delete" | "update";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as BulkAction | undefined;
  const invoiceIds = Array.isArray(body?.invoiceIds)
    ? (body.invoiceIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  if (!action || !["resend", "delete", "update"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!invoiceIds.length) {
    return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
  }

  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const { rows: owned } = await dbPool.query<{ id: string }>(
    `select id from invoices where lead_id = $1 and id = any($2::uuid[])`,
    [leadId, invoiceIds]
  );
  const ownedIds = new Set(owned.map((r) => r.id));
  if (ownedIds.size !== invoiceIds.length) {
    return NextResponse.json({ error: "One or more invoices not found for this lead" }, { status: 404 });
  }

  const by = session.user?.email ?? "unknown";

  if (action === "delete") {
    const { rowCount } = await dbPool.query(
      `delete from invoices where lead_id = $1 and id = any($2::uuid[])`,
      [leadId, invoiceIds]
    );
    return NextResponse.json({ ok: true, deleted: rowCount ?? 0 });
  }

  if (action === "update") {
    const status = body?.status as string | undefined;
    if (!status || !INVOICE_STATUSES.includes(status as InvoiceStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const paidAtClause =
      status === "paid"
        ? `, paid_at = coalesce(paid_at, now())`
        : status === "void" || status === "draft" || status === "sent" || status === "overdue"
          ? `, paid_at = null`
          : "";

    const { rowCount } = await dbPool.query(
      `update invoices
       set status = $3, updated_at = now()${paidAtClause}
       where lead_id = $1 and id = any($2::uuid[])`,
      [leadId, invoiceIds, status]
    );

    for (const invoiceId of invoiceIds) {
      await dbPool.query(
        `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
         values ($1, 'invoice_updated', 'Invoice updated', $2, $3::jsonb)`,
        [
          leadId,
          `Bulk update → ${status}`,
          JSON.stringify({ invoiceId, status, by, bulk: true }),
        ]
      );
    }

    return NextResponse.json({ ok: true, updated: rowCount ?? 0 });
  }

  // resend
  const results: { id: string; ok: boolean; error?: string; code?: string }[] = [];
  for (const invoiceId of invoiceIds) {
    try {
      await sendInvoiceEmail(dbPool, invoiceId, { by });
      results.push({ id: invoiceId, ok: true });
    } catch (err) {
      if (err instanceof InvoiceSendError) {
        results.push({ id: invoiceId, ok: false, error: err.message, code: err.code });
      } else {
        results.push({
          id: invoiceId,
          ok: false,
          error: err instanceof Error ? err.message : "Send failed",
        });
      }
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    sent,
    failed: failed.length,
    results,
  });
}
