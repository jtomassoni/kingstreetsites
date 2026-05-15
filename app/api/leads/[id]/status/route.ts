import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { LEAD_STATUSES } from "@/lib/lead-status";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const status = body?.status as string | undefined;

  if (!status || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await ensureOutreachSchema(dbPool);

  const result = await dbPool.query(
    `update leads
     set status = $2, updated_at = now()
     where id = $1
     returning id, status`,
    [id, status]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'status_changed', 'Status updated', $2, $3::jsonb)`,
    [
      id,
      `Set status to "${status.replaceAll("_", " ")}"`,
      JSON.stringify({
        status,
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, status });
}
