import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureLeadSiteIssuesSchema } from "@/lib/lead-site-issues";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, issueId } = await params;
  await ensureLeadSiteIssuesSchema(dbPool);

  const body = await req.json().catch(() => ({}));
  const description =
    typeof body.description === "string" ? body.description.trim() : undefined;

  if (description === undefined) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const { rows } = await dbPool.query(
    `update lead_site_issues
     set description = $3
     where id = $2 and lead_id = $1
     returning id, lead_id, image_url, description, sort_order, created_at`,
    [id, issueId, description]
  );

  if (!rows[0]) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, issue: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, issueId } = await params;
  await ensureLeadSiteIssuesSchema(dbPool);

  const { rowCount } = await dbPool.query(
    `delete from lead_site_issues where id = $2 and lead_id = $1`,
    [id, issueId]
  );

  if (!rowCount) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
