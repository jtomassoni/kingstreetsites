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
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import {
  parseStoredReceipts,
  uploadPaymentReceipts,
  validateReceiptFiles,
} from "@/lib/payment-receipts";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, paymentId } = await params;
  const contentType = req.headers.get("content-type") ?? "";
  await ensureBillingSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const paymentRes = await dbPool.query(
    `select p.*, i.lead_id, i.invoice_number
     from invoice_payments p
     join invoices i on i.id = p.invoice_id
     where p.id = $1 and p.invoice_id = $2`,
    [paymentId, id]
  );
  const payment = paymentRes.rows[0];
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  let receiptFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    if (form.has("amount")) body.amount = form.get("amount");
    if (form.has("method")) body.method = form.get("method");
    if (form.has("notes")) body.notes = form.get("notes");
    if (form.has("paid_at")) body.paid_at = form.get("paid_at");
    receiptFiles = form
      .getAll("receipts")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  } else {
    body = await req.json().catch(() => ({}));
  }

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

  const nextMethod =
    "method" in body ? (body.method as string) : (payment.method as string);
  const nextNotes =
    "notes" in body
      ? typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim()
        : null
      : (payment.notes as string | null);

  if ("method" in body) {
    if (!PAYMENT_METHODS.includes(nextMethod as PaymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    values.push(nextMethod);
    updates.push(`method = $${values.length}`);
  }

  if ("notes" in body) {
    values.push(nextNotes);
    updates.push(`notes = $${values.length}`);
  }

  if (nextMethod === "barter" && !nextNotes) {
    return NextResponse.json(
      { error: "Describe the barter arrangement (what was exchanged)" },
      { status: 400 }
    );
  }

  if ("paid_at" in body) {
    values.push(body.paid_at || null);
    updates.push(`paid_at = $${values.length}`);
  }

  const existingReceipts = parseStoredReceipts(payment.receipts);
  if (receiptFiles.length > 0) {
    const totalCount = existingReceipts.length + receiptFiles.length;
    if (totalCount > 5) {
      return NextResponse.json({ error: "Up to 5 receipt files per payment." }, { status: 400 });
    }
    const newFileError = validateReceiptFiles(receiptFiles);
    if (newFileError) {
      return NextResponse.json({ error: newFileError }, { status: 400 });
    }

    try {
      const uploaded = await uploadPaymentReceipts(paymentId, receiptFiles);
      const merged = [...existingReceipts, ...uploaded];
      values.push(JSON.stringify(merged));
      updates.push(`receipts = $${values.length}::jsonb`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not upload receipt files.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
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
  const updated = rows[0];
  if (updated) {
    updated.receipts = parseStoredReceipts(updated.receipts);
  }

  const invoiceRes = await dbPool.query(
    `select invoice_number from invoices where id = $1`,
    [id]
  );
  const invoiceNumber = invoiceRes.rows[0]?.invoice_number ?? id;

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'payment_updated', 'Payment updated', $2, $3::jsonb)`,
    [
      payment.lead_id,
      `${invoiceNumber} · $${((updated?.amount_cents ?? payment.amount_cents) / 100).toFixed(2)} via ${updated?.method ?? payment.method}`,
      JSON.stringify({
        invoiceId: id,
        paymentId,
        amountCents: updated?.amount_cents ?? payment.amount_cents,
        method: updated?.method ?? payment.method,
        receiptCount: parseStoredReceipts(updated?.receipts ?? payment.receipts).length,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, payment: updated, status: nextStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, paymentId } = await params;
  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const paymentRes = await dbPool.query(
    `select p.amount_cents, p.method, i.lead_id, i.invoice_number
     from invoice_payments p
     join invoices i on i.id = p.invoice_id
     where p.id = $1 and p.invoice_id = $2`,
    [paymentId, id]
  );
  const payment = paymentRes.rows[0];
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const { rows } = await dbPool.query(
    `delete from invoice_payments
     where id = $1 and invoice_id = $2
     returning id`,
    [paymentId, id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const nextStatus = await syncInvoiceStatusFromPayments(dbPool, id);

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'payment_deleted', 'Payment removed', $2, $3::jsonb)`,
    [
      payment.lead_id,
      `${payment.invoice_number} · $${(payment.amount_cents / 100).toFixed(2)} via ${payment.method}`,
      JSON.stringify({
        invoiceId: id,
        paymentId,
        amountCents: payment.amount_cents,
        method: payment.method,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, status: nextStatus });
}
