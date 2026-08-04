import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  nextInvoiceNumber,
  INVOICE_STATUSES,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureBillingSchema(dbPool);

  const { rows } = await dbPool.query(
    `select i.*,
            coalesce((select sum(p.amount_cents) from invoice_payments p where p.invoice_id = i.id), 0)::int as paid_cents
     from invoices i
     where i.lead_id = $1
     order by i.created_at desc`,
    [id]
  );

  return NextResponse.json({ invoices: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Website project";
  const amountDollars = Number(body.amount);
  if (!Number.isFinite(amountDollars) || amountDollars < 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }

  const status =
    typeof body.status === "string" && INVOICE_STATUSES.includes(body.status)
      ? body.status
      : "draft";
  const dueDate = typeof body.due_date === "string" && body.due_date ? body.due_date : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const lead = await dbPool.query(`select id from leads where id = $1`, [id]);
  if (!lead.rows[0]) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const invoiceNumber = await nextInvoiceNumber(dbPool);
  const amountCents = dollarsToCents(amountDollars);

  const { rows } = await dbPool.query(
    `insert into invoices (lead_id, invoice_number, title, amount_cents, status, due_date, notes)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [id, invoiceNumber, title, amountCents, status, dueDate, notes]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'invoice_created', 'Invoice created', $2, $3::jsonb)`,
    [
      id,
      `${invoiceNumber} · ${title}`,
      JSON.stringify({
        invoiceId: rows[0].id,
        amountCents,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, invoice: rows[0] }, { status: 201 });
}
