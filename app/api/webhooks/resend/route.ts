import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { Webhook } from "svix";
import {
  asEmailList,
  firstEmail,
  ingestReceivedEmail,
  leadIdFromAddresses,
} from "@/lib/inbound-email";
import { htmlToPlainText } from "@/lib/outreach-email";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing RESEND_WEBHOOK_SECRET" }, { status: 500 });
  }

  const payload = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // Ignore delivery/open/click/etc. — only inbound mail becomes a thread message.
  if (event.type && event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : event;

  const providerMessageId =
    (typeof data.email_id === "string" && data.email_id) ||
    (typeof data.id === "string" && data.id) ||
    null;

  let fromEmail = firstEmail(data.from ?? data.from_email);
  let toAddresses = asEmailList(data.to ?? data.to_email);
  let receivedFor = asEmailList(data.received_for);
  let subject =
    (typeof data.subject === "string" && data.subject) || "(no subject)";
  let text = typeof data.text === "string" ? data.text : "";
  let html = typeof data.html === "string" ? data.html : null;

  // Resend email.received webhooks are metadata-only; fetch body from Receiving API.
  if (providerMessageId && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data: received, error } = await resend.emails.receiving.get(providerMessageId);
      if (!error && received) {
        fromEmail = firstEmail(received.from) || fromEmail;
        toAddresses = asEmailList(received.to).length ? asEmailList(received.to) : toAddresses;
        receivedFor = asEmailList(received.received_for).length
          ? asEmailList(received.received_for)
          : receivedFor;
        subject = received.subject?.trim() || subject;
        text = received.text ?? text;
        html = received.html ?? html;
        if (!text && html) text = htmlToPlainText(html);
      }
    } catch {
      // Keep metadata-only fallback if Receiving API is unavailable.
    }
  }

  if (!text && html) text = htmlToPlainText(html);

  const toEmail = toAddresses[0] || receivedFor[0] || "";
  const leadIdHint =
    (typeof data.lead_id === "string" && data.lead_id) ||
    (typeof event.leadId === "string" && event.leadId) ||
    (typeof event.lead_id === "string" && event.lead_id) ||
    leadIdFromAddresses(toAddresses, receivedFor, data.to, data.received_for) ||
    undefined;

  const result = await ingestReceivedEmail({
    providerMessageId,
    fromEmail,
    toEmail,
    toAddresses,
    receivedFor,
    subject,
    text,
    html,
    leadIdHint,
  });

  if (result.status === "skipped") {
    const status = result.reason.includes("not found") ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  if (result.status === "duplicate") {
    return NextResponse.json({ ok: true, duplicate: true, leadId: result.leadId });
  }

  return NextResponse.json({ ok: true, leadId: result.leadId });
}
