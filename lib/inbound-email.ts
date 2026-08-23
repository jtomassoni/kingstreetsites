import { Resend } from "resend";
import { dbPool } from "@/lib/db";
import { htmlToPlainText, parseEmailAddress } from "@/lib/outreach-email";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

const LEAD_ID_RE = /\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

export function parseLeadIdFromAddress(raw: string | undefined | null): string {
  if (!raw) return "";
  const match = raw.match(LEAD_ID_RE);
  return match?.[1]?.toLowerCase() ?? "";
}

export function asEmailList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && typeof (item as { email?: unknown }).email === "string") {
        return (item as { email: string }).email.trim();
      }
      return "";
    })
    .filter(Boolean);
}

export function firstEmail(value: unknown): string {
  for (const raw of asEmailList(value)) {
    const parsed = parseEmailAddress(raw);
    if (parsed) return parsed.email;
  }
  return asEmailList(value)[0] ?? "";
}

export function leadIdFromAddresses(...groups: unknown[]): string {
  for (const group of groups) {
    for (const address of asEmailList(group)) {
      const leadId = parseLeadIdFromAddress(address);
      if (leadId) return leadId;
    }
  }
  return "";
}

export type IngestReceivedResult =
  | { status: "imported"; leadId: string }
  | { status: "duplicate"; leadId?: string }
  | { status: "skipped"; reason: string };

/** Persist one Resend received email into the lead thread. */
export async function ingestReceivedEmail(input: {
  providerMessageId: string | null;
  fromEmail: string;
  toEmail: string;
  toAddresses?: string[];
  receivedFor?: string[];
  subject: string;
  text: string;
  html: string | null;
  leadIdHint?: string;
}): Promise<IngestReceivedResult> {
  await ensureOutreachSchema(dbPool);

  if (input.providerMessageId) {
    const existing = await dbPool.query(
      `select id, lead_id from lead_messages
       where provider = 'resend' and provider_message_id = $1
       limit 1`,
      [input.providerMessageId]
    );
    if (existing.rows[0]) {
      return { status: "duplicate", leadId: existing.rows[0].lead_id as string };
    }
  }

  let leadId =
    input.leadIdHint ||
    leadIdFromAddresses(input.toAddresses ?? [input.toEmail], input.receivedFor ?? []);

  // Only fall back when the sender matches a lead's contact_email and we recently
  // emailed them — never attach unrelated historical inbox noise by From alone.
  if (!leadId && input.fromEmail) {
    const lookup = await dbPool.query<{ id: string }>(
      `select l.id
       from leads l
       where lower(l.contact_email) = lower($1)
         and exists (
           select 1 from lead_messages m
           where m.lead_id = l.id
             and m.direction = 'outbound'
             and m.created_at > now() - interval '30 days'
         )
       order by l.updated_at desc
       limit 1`,
      [input.fromEmail]
    );
    leadId = lookup.rows[0]?.id ?? "";
  }

  if (!leadId) {
    return { status: "skipped", reason: "Unable to map inbound email to lead" };
  }

  const leadExists = await dbPool.query(`select id from leads where id = $1 limit 1`, [leadId]);
  if (!leadExists.rows[0]) {
    return { status: "skipped", reason: "Lead not found for inbound email" };
  }

  let text = input.text;
  let html = input.html;
  if (!text && html) text = htmlToPlainText(html);

  await dbPool.query(
    `insert into lead_messages
      (lead_id, direction, channel, from_email, to_email, subject, body_text, body_html, provider, provider_message_id)
     values
      ($1, 'inbound', 'email', $2, $3, $4, $5, $6, 'resend', $7)`,
    [
      leadId,
      input.fromEmail || null,
      input.toEmail || null,
      input.subject,
      text || "",
      html,
      input.providerMessageId,
    ]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'email_received', 'Reply received', $2, $3::jsonb)`,
    [
      leadId,
      input.subject,
      JSON.stringify({
        from: input.fromEmail,
        to: input.toEmail,
        receivedFor: input.receivedFor ?? [],
        providerMessageId: input.providerMessageId,
      }),
    ]
  );

  await dbPool.query(
    `update leads
     set status = case when status in ('new','staged','reached_out','clicked') then 'replied' else status end,
         updated_at = now()
     where id = $1`,
    [leadId]
  );

  return { status: "imported", leadId };
}

/** Pull recent Resend received emails into local threads (backfill / local recovery). */
export async function syncReceivedEmails({
  limit = 25,
}: {
  limit?: number;
} = {}): Promise<{ imported: number; duplicate: number; skipped: number; details: IngestReceivedResult[] }> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.receiving.list({ limit });
  if (error) {
    throw new Error(error.message ?? "Failed to list received emails");
  }

  const details: IngestReceivedResult[] = [];
  let imported = 0;
  let duplicate = 0;
  let skipped = 0;

  const inboundDomain = (
    process.env.OUTREACH_INBOUND_EMAIL ??
    process.env.OUTREACH_FROM_EMAIL ??
    ""
  )
    .split("@")[1]
    ?.toLowerCase();

  for (const item of data?.data ?? []) {
    const providerMessageId = item.id;
    let fromEmail = firstEmail(item.from);
    let toAddresses = asEmailList(item.to);
    let receivedFor = asEmailList((item as { received_for?: unknown }).received_for);
    let subject = item.subject?.trim() || "(no subject)";
    let text = "";
    let html: string | null = null;

    // Skip other Resend-receiving domains in the same account (e.g. restaurant inboxes).
    if (inboundDomain) {
      const recipients = [...toAddresses, ...receivedFor].map((a) => a.toLowerCase());
      const forThisDomain = recipients.some((a) => a.endsWith(`@${inboundDomain}`));
      if (!forThisDomain) {
        const skip: IngestReceivedResult = {
          status: "skipped",
          reason: `Ignoring received mail outside @${inboundDomain}`,
        };
        details.push(skip);
        skipped += 1;
        continue;
      }
    }

    try {
      const { data: received, error: getError } = await resend.emails.receiving.get(providerMessageId);
      if (!getError && received) {
        fromEmail = firstEmail(received.from) || fromEmail;
        toAddresses = asEmailList(received.to).length ? asEmailList(received.to) : toAddresses;
        receivedFor = asEmailList(received.received_for).length
          ? asEmailList(received.received_for)
          : receivedFor;
        subject = received.subject?.trim() || subject;
        text = received.text ?? "";
        html = received.html ?? null;
      }
    } catch {
      // Continue with metadata-only if content fetch fails.
    }

    const result = await ingestReceivedEmail({
      providerMessageId,
      fromEmail,
      toEmail: toAddresses[0] || receivedFor[0] || "",
      toAddresses,
      receivedFor,
      subject,
      text,
      html,
    });

    details.push(result);
    if (result.status === "imported") imported += 1;
    else if (result.status === "duplicate") duplicate += 1;
    else skipped += 1;
  }

  return { imported, duplicate, skipped, details };
}
