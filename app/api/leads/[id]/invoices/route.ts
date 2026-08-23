import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureBillingSchema,
  dollarsToCents,
  nextInvoiceNumber,
  INVOICE_STATUSES,
  RECURRING_FREQUENCIES,
  advanceRecurringDate,
  generateDueScheduledInvoices,
  type RecurringFrequency,
} from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { InvoiceSendError, sendInvoiceEmail } from "@/lib/invoice-email";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureBillingSchema(dbPool);
  await generateDueScheduledInvoices(dbPool, {
    leadId: id,
    createdBy: session.user?.email ?? "unknown",
  });

  const { rows } = await dbPool.query(
    `select i.*,
            s.frequency as schedule_frequency,
            s.active as schedule_active,
            coalesce((select sum(p.amount_cents) from invoice_payments p where p.invoice_id = i.id), 0)::int as paid_cents
     from invoices i
     left join invoice_schedules s on s.id = i.schedule_id
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

  const recurring = Boolean(body.recurring);
  const frequencyRaw = typeof body.frequency === "string" ? body.frequency : "monthly";
  const frequency = RECURRING_FREQUENCIES.includes(frequencyRaw as RecurringFrequency)
    ? (frequencyRaw as RecurringFrequency)
    : null;
  const endOn =
    typeof body.end_on === "string" && body.end_on.trim() ? body.end_on.trim() : null;
  const sendEmail = Boolean(body.send_email);

  if (recurring) {
    if (!frequency) {
      return NextResponse.json({ error: "Recurring frequency is required" }, { status: 400 });
    }
    if (!dueDate) {
      return NextResponse.json(
        { error: "First due date is required for recurring invoices" },
        { status: 400 }
      );
    }
    if (endOn && endOn < dueDate) {
      return NextResponse.json(
        { error: "End date must be on or after the first due date" },
        { status: 400 }
      );
    }
  }

  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const lead = await dbPool.query(`select id from leads where id = $1`, [id]);
  if (!lead.rows[0]) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const invoiceNumber = await nextInvoiceNumber(dbPool);
  const amountCents = dollarsToCents(amountDollars);

  let scheduleId: string | null = null;
  if (recurring && frequency && dueDate) {
    const nextRun = advanceRecurringDate(dueDate, frequency);
    const scheduleRes = await dbPool.query(
      `insert into invoice_schedules
        (lead_id, title, amount_cents, notes, frequency, next_run_on, end_on, active)
       values ($1, $2, $3, $4, $5, $6, $7, true)
       returning id`,
      [id, title, amountCents, notes, frequency, nextRun, endOn]
    );
    scheduleId = scheduleRes.rows[0].id as string;
  }

  const { rows } = await dbPool.query(
    `insert into invoices
      (lead_id, invoice_number, title, amount_cents, status, due_date, notes, schedule_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [id, invoiceNumber, title, amountCents, status, dueDate, notes, scheduleId]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'invoice_created', $2, $3, $4::jsonb)`,
    [
      id,
      recurring ? "Recurring invoice created" : "Invoice created",
      `${invoiceNumber} · ${title}`,
      JSON.stringify({
        invoiceId: rows[0].id,
        scheduleId,
        amountCents,
        recurring,
        frequency: recurring ? frequency : null,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  let send:
    | { sent: true; to: string; messageId: string | null }
    | { sent: false; error: string; code?: string }
    | null = null;

  if (sendEmail) {
    try {
      const result = await sendInvoiceEmail(dbPool, rows[0].id as string, {
        by: session.user?.email ?? "unknown",
      });
      send = { sent: true, to: result.to, messageId: result.messageId };
    } catch (err) {
      if (err instanceof InvoiceSendError) {
        send = { sent: false, error: err.message, code: err.code };
      } else {
        send = {
          sent: false,
          error: err instanceof Error ? err.message : "Failed to send invoice email",
        };
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      invoice: rows[0],
      schedule_id: scheduleId,
      send,
    },
    { status: 201 }
  );
}
