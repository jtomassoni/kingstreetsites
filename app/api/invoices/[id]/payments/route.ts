import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const amountDollars = Number(body.amount);
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return NextResponse.json({ error: "Valid payment amount is required" }, { status: 400 });
  }

  const method = (body.method as string) || "other";
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const amountCents = dollarsToCents(amountDollars);

  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);

  const invoiceRes = await dbPool.query(`select * from invoices where id = $1`, [id]);
  const invoice = invoiceRes.rows[0];
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  if (method === "barter") {
    const leadRes = await dbPool.query<{ barter_payments_enabled: boolean }>(
      `select barter_payments_enabled from leads where id = $1`,
      [invoice.lead_id]
    );
    if (!leadRes.rows[0]?.barter_payments_enabled) {
      return NextResponse.json(
        { error: "Barter payments are not enabled for this lead" },
        { status: 400 }
      );
    }
  }

  const { rows: paymentRows } = await dbPool.query(
    `insert into invoice_payments (invoice_id, amount_cents, method, notes)
     values ($1, $2, $3, $4)
     returning *`,
    [id, amountCents, method, notes]
  );

  const paidSum = await dbPool.query<{ paid: number }>(
    `select coalesce(sum(amount_cents), 0)::int as paid from invoice_payments where invoice_id = $1`,
    [id]
  );
  const paid = paidSum.rows[0]?.paid ?? 0;

  let nextStatus = invoice.status;
  if (paid >= invoice.amount_cents && invoice.status !== "void") {
    nextStatus = "paid";
  } else if (invoice.status === "draft") {
    nextStatus = "sent";
  }

  await dbPool.query(
    `update invoices
     set status = $2,
         paid_at = case when $2 = 'paid' then coalesce(paid_at, now()) else paid_at end,
         updated_at = now()
     where id = $1`,
    [id, nextStatus]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'payment_recorded', 'Payment recorded', $2, $3::jsonb)`,
    [
      invoice.lead_id,
      `${invoice.invoice_number} · $${(amountCents / 100).toFixed(2)} via ${method === "barter" ? "bar tab" : method}`,
      JSON.stringify({
        invoiceId: id,
        paymentId: paymentRows[0].id,
        amountCents,
        method,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({
    ok: true,
    payment: paymentRows[0],
    paid_cents: paid,
    status: nextStatus,
  });
}
