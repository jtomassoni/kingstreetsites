import { isValidEmail, parseEmailAddress, textToEmailHtml } from "@/lib/outreach-email";
import { formatCheckTime, formatStoreAddress } from "@restock/lib/format";
import { deliveryDecision } from "@restock/lib/scheduling";
import {
  listDueAlerts,
  markAlertFailed,
  markAlertSent,
} from "@restock/lib/store";
import type { AlertRecord, NotificationStatus, StoreState } from "@restock/types";

export { formatCheckTime, formatStoreAddress } from "@restock/lib/format";

type EnvLike = Record<string, string | undefined>;

export type RestockEmailInput = {
  retailerLabel: string;
  productTitle: string;
  productUrl: string;
  store: Pick<
    StoreState,
    "name" | "address1" | "address2" | "city" | "state_code" | "postal_code" | "phone" | "directions_url" | "distance_miles" | "detail"
  >;
  observedAtIso: string;
  dashboardUrl: string;
};

/** Pure: subject + plain-text body for a restock alert. */
export function buildRestockEmail(input: RestockEmailInput): { subject: string; text: string } {
  const subject = `In stock near you: ${input.productTitle} — ${input.store.name} (${input.retailerLabel})`;
  const address = formatStoreAddress(input.store);
  const lines: string[] = [
    `${input.retailerLabel} is showing ${input.productTitle} available at a store near you.`,
    "",
    `Store: ${input.store.name}`,
  ];
  if (address) lines.push(`Address: ${address}`);
  if (input.store.distance_miles !== null && input.store.distance_miles !== undefined) {
    lines.push(`Distance: ${input.store.distance_miles.toFixed(1)} mi`);
  }
  if (input.store.phone) lines.push(`Phone: ${input.store.phone}`);
  if (input.store.detail) lines.push(`Status: ${input.store.detail}`);
  lines.push(`Checked: ${formatCheckTime(input.observedAtIso)}`);
  lines.push("", `Product: ${input.productUrl}`);
  if (input.store.directions_url) lines.push(`Directions: ${input.store.directions_url}`);
  lines.push(
    "",
    "Online store inventory can lag what is actually on the shelf — call ahead before driving.",
    `Tracker: ${input.dashboardUrl}`,
  );
  return { subject, text: lines.join("\n") };
}

export function buildTestEmail(input: { requestedBy: string; dashboardUrl: string }): {
  subject: string;
  text: string;
} {
  return {
    subject: "Restock Tracker test notification",
    text: [
      "This is a test from the King Street Sites Restock Tracker.",
      "",
      `Requested by: ${input.requestedBy}`,
      `Sent: ${formatCheckTime(new Date().toISOString())}`,
      "",
      "If you received this, restock alerts will reach this inbox.",
      `Tracker: ${input.dashboardUrl}`,
    ].join("\n"),
  };
}

export function restockFromAddress(env: EnvLike = process.env): string | null {
  const raw =
    env.RESTOCK_FROM_EMAIL ??
    env.CONTACT_FROM_EMAIL ??
    env.OUTREACH_FROM_EMAIL ??
    null;
  if (!raw) return null;
  return parseEmailAddress(raw)?.email ?? null;
}

export function normalizeRecipients(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const email = v.trim().toLowerCase();
    if (!email || !isValidEmail(email) || out.includes(email)) continue;
    out.push(email);
  }
  return out;
}

export function parseRecipientList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normalizeRecipients(raw.split(/[,\s;]+/));
}

export function getNotificationStatus(
  alertEmails: string[],
  env: EnvLike = process.env,
): NotificationStatus {
  const recipients = normalizeRecipients(alertEmails);
  const fromEmail = restockFromAddress(env);
  if (!env.RESEND_API_KEY) {
    return { configured: false, recipients, fromEmail, reason: "RESEND_API_KEY is not set" };
  }
  if (!fromEmail) {
    return {
      configured: false,
      recipients,
      fromEmail,
      reason: "No sender address (set RESTOCK_FROM_EMAIL or CONTACT_FROM_EMAIL)",
    };
  }
  if (recipients.length === 0) {
    return { configured: false, recipients, fromEmail, reason: "No alert recipients" };
  }
  return { configured: true, recipients, fromEmail, reason: null };
}

async function sendEmail(input: {
  to: string[];
  subject: string;
  text: string;
}): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = restockFromAddress();
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!fromEmail) throw new Error("No sender address configured");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const fromName = (process.env.OUTREACH_FROM_NAME ?? "King Street Sites").trim();
  const { data, error } = await resend.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: textToEmailHtml(input.text),
    tags: [{ name: "category", value: "restock" }],
  });
  if (error) throw new Error(error.message ?? "Resend rejected the email");
  return { id: data?.id ?? null };
}

/**
 * Attempt delivery for alerts that are due. Sent alerts are never retried;
 * failures are kept with an incremented attempt count and a later
 * next_attempt_at so the next run (cron or manual) can retry them.
 */
export async function deliverDueAlerts(
  householdId: string,
  send: (input: { to: string[]; subject: string; text: string }) => Promise<{ id: string | null }> = sendEmail,
): Promise<{ sent: number; failed: number }> {
  const due = await listDueAlerts(householdId);
  let sent = 0;
  let failed = 0;
  for (const alert of due) {
    const outcome = await attemptDelivery(alert, send);
    if (outcome.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

export async function attemptDelivery(
  alert: AlertRecord,
  send: (input: { to: string[]; subject: string; text: string }) => Promise<{ id: string | null }> = sendEmail,
): Promise<{ ok: boolean; error?: string }> {
  const decision = deliveryDecision({
    status: alert.status,
    recipients: normalizeRecipients(alert.recipients),
  });
  if (decision === "already_sent") return { ok: true };
  if (decision === "no_recipients") {
    await markAlertFailed(alert, "No valid recipients");
    return { ok: false, error: "No valid recipients" };
  }
  const recipients = normalizeRecipients(alert.recipients);
  try {
    const { id } = await send({ to: recipients, subject: alert.subject, text: alert.body });
    await markAlertSent(alert.id, id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email delivery failed";
    await markAlertFailed(alert, message);
    return { ok: false, error: message };
  }
}
