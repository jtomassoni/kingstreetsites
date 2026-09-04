import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  INVOICE_STATUSES,
  syncInvoiceStatusFromPayments,
  type InvoiceStatus,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { getInvoiceActivity } from "@/lib/invoice-activity";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureBillingSchema(dbPool);

  const { rows: invoiceRows } = await dbPool.query(
    `select i.*, i.due_date::text as due_date from invoices i where i.id = $1`,
    [id]
  );
  if (!invoiceRows[0]) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { rows: payments } = await dbPool.query(
    `select id, invoice_id, amount_cents, method, paid_at, notes, receipts, created_at
     from invoice_payments
     where invoice_id = $1
     order by paid_at asc, created_at asc`,
    [id]
  );

  const paid_cents = payments.reduce((sum, p) => sum + Number(p.amount_cents), 0);

  const activity = await getInvoiceActivity(dbPool, id, invoiceRows[0].lead_id);

  return NextResponse.json({
    invoice: invoiceRows[0],
    payments,
    paid_cents,
    activity,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const existingRes = await dbPool.query(
    `select lead_id, invoice_number, status from invoices where id = $1`,
    [id]
  );
  const existing = existingRes.rows[0];
  if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];

  if ("title" in body && typeof body.title === "string" && body.title.trim()) {
    values.push(body.title.trim());
    updates.push(`title = $${values.length}`);
    changedFields.push("title");
  }
  if ("amount" in body) {
    const amountDollars = Number(body.amount);
    if (!Number.isFinite(amountDollars) || amountDollars < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    values.push(dollarsToCents(amountDollars));
    updates.push(`amount_cents = $${values.length}`);
    changedFields.push("amount");
  }
  if ("status" in body) {
    const status = body.status as string;
    if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    values.push(status);
    updates.push(`status = $${values.length}`);
    changedFields.push("status");
    if (status === "paid") {
      updates.push(`paid_at = coalesce(paid_at, now())`);
    } else {
      updates.push(`paid_at = null`);
    }
  }
  if ("due_date" in body) {
    values.push(body.due_date || null);
    updates.push(`due_date = $${values.length}`);
    changedFields.push("due date");
  }
  if ("notes" in body) {
    values.push(typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null);
    updates.push(`notes = $${values.length}`);
    changedFields.push("notes");
  }

  if (!updates.length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);
  const { rows } = await dbPool.query(
    `update invoices
     set ${updates.join(", ")}, updated_at = now()
     where id = $${values.length}
     returning *`,
    values
  );

  if (!rows[0]) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  if ("amount" in body) {
    await syncInvoiceStatusFromPayments(dbPool, id);
    const refreshed = await dbPool.query(`select * from invoices where id = $1`, [id]);
    if (refreshed.rows[0]) rows[0] = refreshed.rows[0];
  }

  if (changedFields.length > 0) {
    const by = session.user?.email ?? "unknown";
    const bodyText =
      "status" in body && changedFields.includes("status")
        ? `${rows[0].invoice_number} → ${body.status}`
        : `${rows[0].invoice_number} · ${changedFields.join(", ")} updated`;

    await dbPool.query(
      `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
       values ($1, 'invoice_updated', 'Invoice updated', $2, $3::jsonb)`,
      [
        rows[0].lead_id,
        bodyText,
        JSON.stringify({
          invoiceId: id,
          status: body.status ?? rows[0].status,
          changedFields,
          by,
        }),
      ]
    );
  }

  return NextResponse.json({ ok: true, invoice: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureBillingSchema(dbPool);

  const { rows } = await dbPool.query(
    `delete from invoices where id = $1 returning id, lead_id, invoice_number`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
