import { Resend } from "resend";

import { ContactInput } from "@/lib/validation";
import { getEnv, getOptionalEnv } from "@/lib/env";

function getResendClient(): Resend {
  return new Resend(getEnv("RESEND_API_KEY"));
}

export async function sendLeadNotification(input: ContactInput): Promise<void> {
  const resend = getResendClient();
  const to = getEnv("CONTACT_TO_EMAIL");
  const from = getEnv("CONTACT_FROM_EMAIL");

  await resend.emails.send({
    to,
    from,
    subject: `New site audit request from ${input.businessName}`,
    replyTo: input.email,
    html: `
      <h1>New King Street Sites lead</h1>
      <p><strong>Name:</strong> ${input.name}</p>
      <p><strong>Business:</strong> ${input.businessName}</p>
      <p><strong>Email:</strong> ${input.email}</p>
      <p><strong>Website:</strong> ${input.website || "Not provided"}</p>
      <p><strong>Industry:</strong> ${input.industry}</p>
      <p><strong>Message:</strong><br/>${input.message}</p>
    `
  });
}

export async function sendAutoReply(input: ContactInput): Promise<void> {
  const autoReplyFrom = getOptionalEnv("AUTO_REPLY_FROM_EMAIL");
  if (!autoReplyFrom) return;

  const resend = getResendClient();
  await resend.emails.send({
    to: input.email,
    from: autoReplyFrom,
    subject: "We received your site audit request",
    html: `
      <h1>Thanks for reaching out, ${input.name}</h1>
      <p>We received your request and will follow up soon with next steps.</p>
      <p>King Street Sites builds websites that turn visitors into customers.</p>
    `
  });
}
