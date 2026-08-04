import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import { Resend } from "resend";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const to = (body?.to as string | undefined)?.trim();
  let subject = (body?.subject as string | undefined)?.trim();
  const message = (body?.message as string | undefined)?.trim();

  if (!to || !message) {
    return NextResponse.json({ error: "to and message are required" }, { status: 400 });
  }

  await ensureOutreachSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);

  if (!subject) {
    const last = await dbPool.query<{ subject: string | null }>(
      `select subject from lead_messages
       where lead_id = $1 and subject is not null and subject <> ''
       order by created_at desc
       limit 1`,
      [id]
    );
    const prior = last.rows[0]?.subject?.trim();
    if (prior) {
      subject = prior.toLowerCase().startsWith("re:") ? prior : `Re: ${prior}`;
    }
  }

  if (!subject) {
    return NextResponse.json(
      { error: "subject is required for the first message" },
      { status: 400 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.OUTREACH_FROM_EMAIL ??
    process.env.AUTH_FROM_EMAIL ??
    "onboarding@resend.dev";

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    text: message,
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Failed to send email" }, { status: 502 });
  }

  await dbPool.query(
    `insert into lead_messages
      (lead_id, direction, channel, from_email, to_email, subject, body_text, provider, provider_message_id)
     values
      ($1, 'outbound', 'email', $2, $3, $4, $5, 'resend', $6)`,
    [id, fromEmail, to, subject, message, data?.id ?? null]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'email_sent', 'Email sent', $2, $3::jsonb)`,
    [
      id,
      subject,
      JSON.stringify({
        to,
        from: fromEmail,
        providerMessageId: data?.id ?? null,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  await dbPool.query(
    `update leads
     set status = case when status in ('new','staged') then 'reached_out' else status end,
         contact_email = coalesce(nullif(contact_email, ''), $2),
         updated_at = now()
     where id = $1`,
    [id, to]
  );

  return NextResponse.json({ ok: true, messageId: data?.id ?? null });
}
