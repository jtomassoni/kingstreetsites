import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  INVOICE_STATUSES,
  type InvoiceStatus,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

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

  const updates: string[] = [];
  const values: unknown[] = [];

  if ("title" in body && typeof body.title === "string" && body.title.trim()) {
    values.push(body.title.trim());
    updates.push(`title = $${values.length}`);
  }
  if ("amount" in body) {
    const amountDollars = Number(body.amount);
    if (!Number.isFinite(amountDollars) || amountDollars < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    values.push(dollarsToCents(amountDollars));
    updates.push(`amount_cents = $${values.length}`);
  }
  if ("status" in body) {
    const status = body.status as string;
    if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    values.push(status);
    updates.push(`status = $${values.length}`);
    if (status === "paid") {
      updates.push(`paid_at = coalesce(paid_at, now())`);
    } else {
      updates.push(`paid_at = null`);
    }
  }
  if ("due_date" in body) {
    values.push(body.due_date || null);
    updates.push(`due_date = $${values.length}`);
  }
  if ("notes" in body) {
    values.push(typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null);
    updates.push(`notes = $${values.length}`);
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

  if (body.status) {
    await dbPool.query(
      `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
       values ($1, 'invoice_updated', 'Invoice updated', $2, $3::jsonb)`,
      [
        rows[0].lead_id,
        `${rows[0].invoice_number} → ${body.status}`,
        JSON.stringify({
          invoiceId: id,
          status: body.status,
          by: session.user?.email ?? "unknown",
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
