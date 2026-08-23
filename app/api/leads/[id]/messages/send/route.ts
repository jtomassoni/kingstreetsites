import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import {
  buildLeadInboundReplyTo,
  isValidEmail,
  sendOutreachEmail,
} from "@/lib/outreach-email";
import {
  buildSiteIssuesHtml,
  buildSiteIssuesPlainText,
  ensureLeadSiteIssuesSchema,
} from "@/lib/lead-site-issues";

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
  const siteIssueIds = Array.isArray(body?.siteIssueIds)
    ? (body.siteIssueIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  if (!to || !message) {
    return NextResponse.json({ error: "to and message are required" }, { status: 400 });
  }

  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "Recipient email is invalid" }, { status: 400 });
  }

  await ensureOutreachSchema(dbPool);
  await ensureLeadCrmSchema(dbPool);
  await ensureLeadSiteIssuesSchema(dbPool);

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

  let selectedIssues: { image_url: string; description: string }[] = [];
  if (siteIssueIds.length > 0) {
    const { rows } = await dbPool.query<{ id: string; image_url: string; description: string }>(
      `select id, image_url, description
       from lead_site_issues
       where lead_id = $1 and id = any($2::uuid[])
       order by sort_order asc, created_at asc`,
      [id, siteIssueIds]
    );
    selectedIssues = rows;
  }

  const fullMessage =
    selectedIssues.length > 0 ? `${message}${buildSiteIssuesPlainText(selectedIssues)}` : message;
  const extraBodyHtml = buildSiteIssuesHtml(selectedIssues);

  let sent: { id: string | null; fromEmail: string; from: string };
  let inboundReplyTo: string;
  try {
    inboundReplyTo = buildLeadInboundReplyTo(id);
    sent = await sendOutreachEmail({
      to,
      subject,
      message: fullMessage,
      replyTo: inboundReplyTo,
      extraBodyHtml,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    const status =
      msg.includes("not verified") || msg.includes("not added") || msg.includes("resend.dev")
        ? 422
        : 502;
    return NextResponse.json({ error: msg }, { status });
  }

  await dbPool.query(
    `insert into lead_messages
      (lead_id, direction, channel, from_email, to_email, subject, body_text, provider, provider_message_id)
     values
      ($1, 'outbound', 'email', $2, $3, $4, $5, 'resend', $6)`,
    [id, sent.fromEmail, to, subject, fullMessage, sent.id]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'email_sent', 'Email sent', $2, $3::jsonb)`,
    [
      id,
      subject,
      JSON.stringify({
        to,
        from: sent.from,
        replyTo: inboundReplyTo,
        providerMessageId: sent.id,
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

  return NextResponse.json({ ok: true, messageId: sent.id });
}
