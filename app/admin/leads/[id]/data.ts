import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureBillingSchema } from "@/lib/billing";
import { dbPool } from "@/lib/db";

export async function getLead(id: string) {
  await ensureLeadCrmSchema(dbPool);
  const { rows } = await dbPool.query(`select * from leads where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getLeadMessages(id: string) {
  await ensureOutreachSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `select id, direction, from_email, to_email, subject, body_text, created_at
       from lead_messages
       where lead_id = $1
       order by created_at asc`,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getLeadNotes(id: string) {
  await ensureOutreachSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `select id, note, created_by, created_at
       from lead_notes
       where lead_id = $1
       order by created_at asc`,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getLeadTimeline(id: string) {
  await ensureOutreachSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `
      select
        id::text,
        'timeline'::text as source,
        event_type,
        title,
        body,
        created_at
      from lead_timeline_events
      where lead_id = $1
        and event_type not in ('email_sent', 'email_received', 'note_added')
      order by created_at desc
      limit 100
      `,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getLeadInvoices(id: string) {
  await ensureBillingSchema(dbPool);
  try {
    const { rows } = await dbPool.query(
      `select i.*,
              coalesce((select sum(p.amount_cents) from invoice_payments p where p.invoice_id = i.id), 0)::int as paid_cents
       from invoices i
       where i.lead_id = $1
       order by i.created_at desc`,
      [id]
    );
    return rows;
  } catch {
    return [];
  }
}
