import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_DEV_DOMAIN = "resend.dev";
const BRAND = {
  ink: "#0c1222",
  muted: "#64748b",
  faint: "#94a3b8",
  cream: "#faf8f5",
  creamDark: "#f0ebe3",
  rule: "#e7e0d6",
  teal: "#0d9488",
  tealBright: "#2dd4bf",
} as const;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function parseEmailAddress(value: string): { email: string; domain: string } | null {
  const trimmed = value.trim();
  // Supports "Name <email@domain>" and bare emails.
  const match = trimmed.match(/^(?:.*?<)?([^\s<>]+@[^\s<>]+)(?:>)?$/);
  const email = (match?.[1] ?? trimmed).toLowerCase();
  if (!isValidEmail(email)) return null;
  const domain = email.split("@")[1] ?? "";
  return { email, domain };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getEmailSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    "https://kingstreetsites.com";
  const url = raw.replace(/\/$/, "");
  // Inbox clients can't fetch localhost — serve logo/assets from production.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    return "https://kingstreetsites.com";
  }
  return url;
}

/** Email-safe HTML mark — matches the site footer K badge, no image attachment needed. */
function buildEmailMarkHtml(siteUrl: string, serif: string): string {
  return `<a href="${escapeHtml(siteUrl)}" style="text-decoration:none;display:inline-block;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td
          align="center"
          valign="middle"
          width="40"
          height="40"
          style="width:40px;height:40px;background-color:${BRAND.ink};border-radius:8px;font-family:${serif};font-size:20px;font-weight:700;color:${BRAND.cream};line-height:40px;text-align:center;mso-line-height-rule:exactly;"
        >K</td>
      </tr>
    </table>
  </a>`;
}

/**
 * Personal-letter email shell: HTML K mark + readable wordmark on cream.
 */
export function buildBrandedEmailHtml({
  bodyHtml,
  preheader = "A note from King Street Sites",
}: {
  bodyHtml: string;
  preheader?: string;
}): string {
  const siteUrl = getEmailSiteUrl();
  const year = new Date().getFullYear();
  const sans =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',Times,serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>King Street Sites</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.creamDark};color:${BRAND.ink};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.creamDark};margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background:${BRAND.cream};border:1px solid ${BRAND.rule};border-radius:14px;">
          <!-- Brand row: K mark + wordmark (HTML text so contrast is always correct) -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    ${buildEmailMarkHtml(siteUrl, serif)}
                  </td>
                  <td style="vertical-align:middle;">
                    <a href="${escapeHtml(siteUrl)}" style="text-decoration:none;color:${BRAND.ink};">
                      <span style="font-family:${serif};font-size:17px;font-weight:600;letter-spacing:-0.02em;color:${BRAND.ink};line-height:1.2;">
                        King Street
                      </span>
                      <span style="font-family:${sans};font-size:17px;font-weight:500;letter-spacing:-0.01em;color:${BRAND.muted};line-height:1.2;">
                        Sites
                      </span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Teal hairline -->
          <tr>
            <td style="padding:20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:2px;background:${BRAND.tealBright};font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding:28px 32px 8px;font-family:${sans};font-size:15px;line-height:1.7;color:${BRAND.ink};">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Quiet footer — less “blast”, better for inbox -->
          <tr>
            <td style="padding:24px 32px 28px;font-family:${sans};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid ${BRAND.rule};padding-top:18px;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BRAND.ink};">
                      King Street Sites
                    </p>
                    <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                      <a href="${escapeHtml(siteUrl)}" style="color:${BRAND.teal};text-decoration:none;">kingstreetsites.com</a>
                    </p>
                    <p style="margin:0;font-size:11px;line-height:1.5;color:${BRAND.faint};">
                      © ${year} King Street Sites · Reply to this email anytime
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function preheaderFromMessage(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "A note from King Street Sites";
  return compact.length > 110 ? `${compact.slice(0, 107)}…` : compact;
}

/** Plain text → branded HTML email that preserves line breaks. */
export function textToEmailHtml(text: string, extraBodyHtml = ""): string {
  const body = escapeHtml(text).replaceAll("\n", "<br />");
  return buildBrandedEmailHtml({
    bodyHtml: `${body}${extraBodyHtml}`,
    preheader: preheaderFromMessage(text),
  });
}

export function getOutreachFrom(): {
  from: string;
  fromEmail: string;
  fromDomain: string;
  replyTo?: string;
} {
  const rawFrom =
    process.env.OUTREACH_FROM_EMAIL ??
    process.env.AUTH_FROM_EMAIL ??
    "onboarding@resend.dev";
  const parsed = parseEmailAddress(rawFrom);
  if (!parsed) {
    throw new Error("OUTREACH_FROM_EMAIL is not a valid email address");
  }

  const fromName = (process.env.OUTREACH_FROM_NAME ?? "King Street Sites").trim();
  const from = fromName ? `${fromName} <${parsed.email}>` : parsed.email;

  const replyRaw =
    process.env.OUTREACH_REPLY_TO ??
    process.env.CONTACT_TO_EMAIL ??
    undefined;
  const replyParsed = replyRaw ? parseEmailAddress(replyRaw) : null;

  return {
    from,
    fromEmail: parsed.email,
    fromDomain: parsed.domain,
    replyTo: replyParsed?.email,
  };
}

/**
 * Resend-inbound Reply-To that encodes the lead id via plus-addressing.
 * Replies hit the receiving domain → email.received webhook → lead thread.
 */
export function buildLeadInboundReplyTo(leadId: string): string {
  const raw =
    process.env.OUTREACH_INBOUND_EMAIL ??
    process.env.OUTREACH_REPLY_TO ??
    process.env.OUTREACH_FROM_EMAIL ??
    process.env.AUTH_FROM_EMAIL;
  const parsed = raw ? parseEmailAddress(raw) : null;
  if (!parsed) {
    throw new Error(
      "Set OUTREACH_INBOUND_EMAIL (or OUTREACH_REPLY_TO / OUTREACH_FROM_EMAIL) to your Resend receiving address"
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) {
    throw new Error("Invalid lead id for inbound reply-to");
  }
  const local = parsed.email.split("@")[0]?.split("+")[0] ?? "replies";
  return `${local}+${leadId}@${parsed.domain}`;
}

/** Rough HTML → plain text for inbound messages that only include HTML. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type DomainDeliverability = {
  ok: boolean;
  fromEmail: string;
  fromDomain: string;
  usingResendDev: boolean;
  domainStatus: string | null;
  issues: string[];
  recommendations: string[];
};

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  region?: string;
};

export async function getOutreachDeliverability(): Promise<DomainDeliverability> {
  const { fromEmail, fromDomain } = getOutreachFrom();
  const usingResendDev = fromDomain === RESEND_DEV_DOMAIN || fromEmail.endsWith(`@${RESEND_DEV_DOMAIN}`);
  const issues: string[] = [];
  const recommendations: string[] = [
    "Confirm SPF, DKIM, and DMARC show Verified in Resend → Domains.",
    "Publish DMARC if missing: TXT _dmarc → v=DMARC1; p=none; (tighten to p=quarantine once stable).",
    "Use a real subject + a short personal message — gibberish tests often land in spam.",
    "Ask recipients to reply once (engagement helps); warm a new domain gradually.",
    "Check Google Postmaster Tools if Gmail keeps filtering kingstreetsites.com.",
  ];

  if (usingResendDev) {
    issues.push("Sending from onboarding@resend.dev — Gmail will usually spam or reject this.");
  }

  if (!process.env.RESEND_API_KEY) {
    issues.push("Missing RESEND_API_KEY.");
    return {
      ok: false,
      fromEmail,
      fromDomain,
      usingResendDev,
      domainStatus: null,
      issues,
      recommendations,
    };
  }

  let domainStatus: string | null = null;
  if (!usingResendDev) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.domains.list();
      if (error) {
        issues.push(`Could not check Resend domains: ${error.message}`);
      } else {
        const domains = (data?.data ?? []) as ResendDomain[];
        const match =
          domains.find((d) => d.name === fromDomain) ??
          domains.find((d) => fromDomain.endsWith(`.${d.name}`));
        if (!match) {
          issues.push(
            `Domain "${fromDomain}" is not added in Resend. Add and verify it before outreach.`
          );
        } else {
          domainStatus = match.status;
          if (match.status !== "verified") {
            issues.push(
              `Resend domain status is "${match.status}". Finish DNS verification (SPF/DKIM) in Resend.`
            );
          }
        }
      }
    } catch (err) {
      issues.push(err instanceof Error ? err.message : "Failed to check Resend domain status");
    }
  }

  return {
    ok: issues.length === 0,
    fromEmail,
    fromDomain,
    usingResendDev,
    domainStatus,
    issues,
    recommendations,
  };
}

export async function sendOutreachEmail({
  to,
  subject,
  message,
  replyTo,
  extraBodyHtml = "",
}: {
  to: string;
  subject: string;
  message: string;
  replyTo?: string;
  extraBodyHtml?: string;
}): Promise<{ id: string | null; fromEmail: string; from: string }> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const toParsed = parseEmailAddress(to);
  if (!toParsed) {
    throw new Error("Recipient email is invalid");
  }

  const { from, fromEmail, fromDomain, replyTo: defaultReplyTo } = getOutreachFrom();

  if (process.env.NODE_ENV === "production" && fromDomain === RESEND_DEV_DOMAIN) {
    throw new Error(
      "Cannot send outreach from resend.dev in production. Set OUTREACH_FROM_EMAIL to a verified domain."
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const effectiveReplyTo = replyTo && isValidEmail(replyTo) ? replyTo.trim() : defaultReplyTo;

  const html = textToEmailHtml(message, extraBodyHtml);

  // mailto unsubscribe helps Gmail treat mail as legitimate 1:1 outreach.
  const unsubscribeMailto = `mailto:${fromEmail}?subject=${encodeURIComponent(`Unsubscribe ${toParsed.email}`)}`;

  const { data, error } = await resend.emails.send({
    from,
    to: toParsed.email,
    subject,
    text: message,
    html,
    ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
    headers: {
      "List-Unsubscribe": `<${unsubscribeMailto}>`,
    },
    tags: [{ name: "category", value: "outreach" }],
  });

  if (error) {
    throw new Error(error.message ?? "Failed to send email");
  }

  return { id: data?.id ?? null, fromEmail, from };
}
