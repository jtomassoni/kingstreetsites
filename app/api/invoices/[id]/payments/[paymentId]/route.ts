import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  PAYMENT_METHODS,
  syncInvoiceStatusFromPayments,
  type PaymentMethod,
} from "@/lib/billing";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, paymentId } = await params;
  const body = await req.json().catch(() => ({}));
  await ensureBillingSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);

  const paymentRes = await dbPool.query(
    `select p.*, i.lead_id
     from invoice_payments p
     join invoices i on i.id = p.invoice_id
     where p.id = $1 and p.invoice_id = $2`,
    [paymentId, id]
  );
  const payment = paymentRes.rows[0];
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];

  if ("amount" in body) {
    const amountDollars = Number(body.amount);
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      return NextResponse.json({ error: "Valid payment amount is required" }, { status: 400 });
    }
    values.push(dollarsToCents(amountDollars));
    updates.push(`amount_cents = $${values.length}`);
  }

  if ("method" in body) {
    const method = body.method as string;
    if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    if (method === "barter") {
      const leadRes = await dbPool.query<{ barter_payments_enabled: boolean }>(
        `select barter_payments_enabled from leads where id = $1`,
        [payment.lead_id]
      );
      if (!leadRes.rows[0]?.barter_payments_enabled) {
        return NextResponse.json(
          { error: "Barter payments are not enabled for this lead" },
          { status: 400 }
        );
      }
    }
    values.push(method);
    updates.push(`method = $${values.length}`);
  }

  if ("notes" in body) {
    values.push(typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null);
    updates.push(`notes = $${values.length}`);
  }

  if ("paid_at" in body) {
    values.push(body.paid_at || null);
    updates.push(`paid_at = $${values.length}`);
  }

  if (!updates.length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(paymentId);
  const { rows } = await dbPool.query(
    `update invoice_payments
     set ${updates.join(", ")}
     where id = $${values.length}
     returning *`,
    values
  );

  const nextStatus = await syncInvoiceStatusFromPayments(dbPool, id);

  return NextResponse.json({ ok: true, payment: rows[0], status: nextStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, paymentId } = await params;
  await ensureBillingSchema(dbPool);

  const { rows } = await dbPool.query(
    `delete from invoice_payments
     where id = $1 and invoice_id = $2
     returning id`,
    [paymentId, id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const nextStatus = await syncInvoiceStatusFromPayments(dbPool, id);

  return NextResponse.json({ ok: true, status: nextStatus });
}
