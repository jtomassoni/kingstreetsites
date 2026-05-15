import { NextRequest, NextResponse } from "next/server";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

function parseLeadIdFromAddress(raw: string | undefined) {
  if (!raw) return "";
  const match = raw.match(/\+([0-9a-f-]{36})@/i);
  return match?.[1] ?? "";
}

export async function POST(req: NextRequest) {
  await ensureOutreachSchema(dbPool);

  const payload = await req.json();

  // Resend inbound payload formats can vary by setup.
  const fromEmail =
    payload?.from ??
    payload?.from_email ??
    payload?.data?.from ??
    "";
  const toEmail =
    payload?.to ??
    payload?.to_email ??
    payload?.data?.to ??
    "";
  const subject = payload?.subject ?? payload?.data?.subject ?? "(no subject)";
  const text = payload?.text ?? payload?.data?.text ?? payload?.html ?? "";
  const html = payload?.html ?? payload?.data?.html ?? null;
  const providerMessageId = payload?.id ?? payload?.data?.id ?? null;

  let leadId =
    payload?.leadId ??
    payload?.lead_id ??
    payload?.data?.lead_id ??
    parseLeadIdFromAddress(toEmail);

  if (!leadId && fromEmail) {
    const lookup = await dbPool.query(
      `select lead_id
       from lead_messages
       where lower(to_email) = lower($1) or lower(from_email) = lower($1)
       order by created_at desc
       limit 1`,
      [fromEmail]
    );
    leadId = lookup.rows[0]?.lead_id ?? "";
  }

  if (!leadId) {
    return NextResponse.json({ ok: false, error: "Unable to map inbound email to lead" }, { status: 400 });
  }

  await dbPool.query(
    `insert into lead_messages
      (lead_id, direction, channel, from_email, to_email, subject, body_text, body_html, provider, provider_message_id)
     values
      ($1, 'inbound', 'email', $2, $3, $4, $5, $6, 'resend', $7)`,
    [leadId, fromEmail || null, toEmail || null, subject, text || "", html, providerMessageId]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'email_received', 'Reply received', $2, $3::jsonb)`,
    [leadId, subject, JSON.stringify({ from: fromEmail, to: toEmail, providerMessageId })]
  );

  await dbPool.query(
    `update leads
     set status = case when status in ('new','staged','reached_out','clicked') then 'replied' else status end,
         updated_at = now()
     where id = $1`,
    [leadId]
  );

  return NextResponse.json({ ok: true });
}
