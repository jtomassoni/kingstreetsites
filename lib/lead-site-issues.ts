import { put } from "@vercel/blob";
import { Pool } from "pg";

export type LeadSiteIssue = {
  id: string;
  lead_id: string;
  image_url: string;
  description: string;
  sort_order: number;
  created_at: string;
};

export const SITE_ISSUE_MAX_BYTES = 8 * 1024 * 1024;
export const SITE_ISSUE_MAX_COUNT = 12;

export const SITE_ISSUE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

let schemaEnsured = false;

export async function ensureLeadSiteIssuesSchema(pool: Pool) {
  if (schemaEnsured) return;
  await pool.query(`
    create table if not exists lead_site_issues (
      id uuid primary key default gen_random_uuid(),
      lead_id uuid not null references leads(id) on delete cascade,
      image_url text not null,
      description text not null default '',
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    create index if not exists lead_site_issues_lead_id_idx on lead_site_issues (lead_id, sort_order, created_at);
  `);
  schemaEnsured = true;
}

export function isSiteIssueContentType(type: string): boolean {
  return SITE_ISSUE_ALLOWED_TYPES.has(type.toLowerCase());
}

export function validateSiteIssueFile(file: File): string | null {
  if (!isSiteIssueContentType(file.type)) {
    return `"${file.name}" is not a supported type (use JPG, PNG, WebP, or GIF).`;
  }
  if (file.size > SITE_ISSUE_MAX_BYTES) {
    return `"${file.name}" exceeds ${SITE_ISSUE_MAX_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, 120) || "screenshot";
}

export async function uploadLeadSiteIssueImage(
  leadId: string,
  file: File
): Promise<{ url: string; filename: string; content_type: string; size_bytes: number }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Screenshot uploads are not configured (missing BLOB_READ_WRITE_TOKEN).");
  }

  const blob = await put(
    `lead-site-issues/${leadId}/${crypto.randomUUID()}-${safeFilename(file.name)}`,
    file,
    {
      access: "public",
      contentType: file.type || undefined,
    }
  );

  return {
    url: blob.url,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Plain-text block for selected site issues (appended to outreach message). */
export function buildSiteIssuesPlainText(issues: Pick<LeadSiteIssue, "description">[]): string {
  if (!issues.length) return "";
  const lines = issues
    .map((issue, index) => {
      const desc = issue.description.trim() || `Issue ${index + 1}`;
      return `${index + 1}. ${desc}`;
    })
    .join("\n");
  return `\n\nIssues we noticed on your current website:\n${lines}`;
}

/** HTML block with screenshots + captions for branded outreach emails. */
export function buildSiteIssuesHtml(issues: Pick<LeadSiteIssue, "image_url" | "description">[]): string {
  if (!issues.length) return "";

  const items = issues
    .map((issue, index) => {
      const caption = escapeHtml(issue.description.trim() || `Issue ${index + 1}`);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr>
    <td style="padding:0;">
      <img src="${escapeHtml(issue.image_url)}" alt="${caption}" width="476" style="display:block;width:100%;max-width:476px;height:auto;border-radius:10px;border:1px solid #e7e0d6;" />
    </td>
  </tr>
  <tr>
    <td style="padding:10px 2px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#64748b;">
      <strong style="color:#0c1222;">${index + 1}.</strong> ${caption}
    </td>
  </tr>
</table>`;
    })
    .join("");

  return `<div style="margin-top:28px;padding-top:24px;border-top:1px solid #e7e0d6;">
  <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#0c1222;">
    Issues we noticed on your current website
  </p>
  ${items}
</div>`;
}
