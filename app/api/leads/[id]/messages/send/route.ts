import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
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
  const subject = (body?.subject as string | undefined)?.trim();
  const message = (body?.message as string | undefined)?.trim();

  if (!to || !subject || !message) {
    return NextResponse.json({ error: "to, subject, and message are required" }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
  }

  await ensureOutreachSchema(dbPool);

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
         updated_at = now()
     where id = $1`,
    [id]
  );

  return NextResponse.json({ ok: true, messageId: data?.id ?? null });
}
