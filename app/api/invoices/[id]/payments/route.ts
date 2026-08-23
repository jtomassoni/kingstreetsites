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
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import {
  parseStoredReceipts,
  uploadPaymentReceipts,
  validateReceiptFiles,
} from "@/lib/payment-receipts";
import { sendPaymentReceiptEmail } from "@/lib/payment-receipt-email";

async function parsePaymentBody(req: NextRequest): Promise<{
  amountDollars: number;
  method: string;
  notes: string | null;
  receiptFiles: File[];
  error?: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const amountDollars = Number(form.get("amount"));
    const method = (form.get("method") as string) || "card";
    const notesRaw = form.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
    const receiptFiles = form
      .getAll("receipts")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      return {
        amountDollars: 0,
        method,
        notes,
        receiptFiles: [],
        error: "Valid payment amount is required",
      };
    }

    const fileError = validateReceiptFiles(receiptFiles);
    if (fileError) {
      return { amountDollars, method, notes, receiptFiles, error: fileError };
    }

    return { amountDollars, method, notes, receiptFiles };
  }

  const body = await req.json().catch(() => ({}));
  const amountDollars = Number(body.amount);
  const method = (body.method as string) || "card";
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return {
      amountDollars: 0,
      method,
      notes,
      receiptFiles: [],
      error: "Valid payment amount is required",
    };
  }

  return { amountDollars, method, notes, receiptFiles: [] };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = await parsePaymentBody(req);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { amountDollars, method, notes, receiptFiles } = parsed;
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  if (method === "barter" && !notes) {
    return NextResponse.json(
      { error: "Describe the barter arrangement (what was exchanged)" },
      { status: 400 }
    );
  }

  const amountCents = dollarsToCents(amountDollars);

  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);

  const invoiceRes = await dbPool.query(`select * from invoices where id = $1`, [id]);
  const invoice = invoiceRes.rows[0];
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { rows: paymentRows } = await dbPool.query(
    `insert into invoice_payments (invoice_id, amount_cents, method, notes, receipts)
     values ($1, $2, $3, $4, '[]'::jsonb)
     returning *`,
    [id, amountCents, method, notes]
  );

  const payment = paymentRows[0];
  let receipts = parseStoredReceipts(payment.receipts);

  if (receiptFiles.length > 0) {
    try {
      receipts = await uploadPaymentReceipts(payment.id, receiptFiles);
      await dbPool.query(`update invoice_payments set receipts = $2::jsonb where id = $1`, [
        payment.id,
        JSON.stringify(receipts),
      ]);
      payment.receipts = receipts;
    } catch (err) {
      await dbPool.query(`delete from invoice_payments where id = $1`, [payment.id]);
      const message =
        err instanceof Error ? err.message : "Could not upload receipt files.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const paidSum = await dbPool.query<{ paid: number }>(
    `select coalesce(sum(amount_cents), 0)::int as paid from invoice_payments where invoice_id = $1`,
    [id]
  );
  const paid = paidSum.rows[0]?.paid ?? 0;
  const nextStatus = await syncInvoiceStatusFromPayments(dbPool, id);

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'payment_recorded', 'Payment recorded', $2, $3::jsonb)`,
    [
      invoice.lead_id,
      `${invoice.invoice_number} · $${(amountCents / 100).toFixed(2)} via ${method === "barter" ? "barter" : method}`,
      JSON.stringify({
        invoiceId: id,
        paymentId: payment.id,
        amountCents,
        method,
        notes,
        receiptCount: receipts.length,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  const receiptResult = await sendPaymentReceiptEmail(dbPool, id, payment.id, {
    by: session.user?.email ?? "unknown",
    totalPaidCents: paid,
  });

  return NextResponse.json({
    ok: true,
    payment: { ...payment, receipts },
    paid_cents: paid,
    status: nextStatus,
    receipt: receiptResult,
  });
}
