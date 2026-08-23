import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import {
  ensureLeadSiteIssuesSchema,
  SITE_ISSUE_MAX_COUNT,
  uploadLeadSiteIssueImage,
  validateSiteIssueFile,
} from "@/lib/lead-site-issues";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

async function leadExists(id: string): Promise<boolean> {
  const { rowCount } = await dbPool.query(`select 1 from leads where id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureLeadCrmSchema(dbPool);
  await ensureLeadSiteIssuesSchema(dbPool);

  const { rows } = await dbPool.query(
    `select id, lead_id, image_url, description, sort_order, created_at
     from lead_site_issues
     where lead_id = $1
     order by sort_order asc, created_at asc`,
    [id]
  );

  return NextResponse.json({ ok: true, issues: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureLeadCrmSchema(dbPool);
  await ensureLeadSiteIssuesSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  if (!(await leadExists(id))) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const descriptionRaw = form.get("description");
  const description =
    typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Screenshot file is required" }, { status: 400 });
  }

  const fileError = validateSiteIssueFile(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  const countResult = await dbPool.query<{ count: string }>(
    `select count(*)::text as count from lead_site_issues where lead_id = $1`,
    [id]
  );
  const count = Number(countResult.rows[0]?.count ?? 0);
  if (count >= SITE_ISSUE_MAX_COUNT) {
    return NextResponse.json(
      { error: `Up to ${SITE_ISSUE_MAX_COUNT} screenshots per lead.` },
      { status: 400 }
    );
  }

  let uploaded;
  try {
    uploaded = await uploadLeadSiteIssueImage(id, file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not upload screenshot.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const sortOrder = count;
  const { rows } = await dbPool.query(
    `insert into lead_site_issues (lead_id, image_url, description, sort_order)
     values ($1, $2, $3, $4)
     returning id, lead_id, image_url, description, sort_order, created_at`,
    [id, uploaded.url, description, sortOrder]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'site_issue_added', 'Site issue screenshot added', $2, $3::jsonb)`,
    [
      id,
      description || "Screenshot uploaded",
      JSON.stringify({
        issueId: rows[0]?.id,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, issue: rows[0] });
}
