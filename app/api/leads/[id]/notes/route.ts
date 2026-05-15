import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const note = (body?.note as string | undefined)?.trim();

  if (!note) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  await ensureOutreachSchema(dbPool);

  await dbPool.query(
    `insert into lead_notes (lead_id, note, created_by)
     values ($1, $2, $3)`,
    [id, note, session.user?.email ?? null]
  );

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'note_added', 'Note added', $2, $3::jsonb)`,
    [
      id,
      note,
      JSON.stringify({
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true });
}
