import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const pool = getDbPool();
  const { rows } = await pool.query(
    `select id, zip, metro, status, total, processed, inserted,
            current_business, error, started_at, finished_at
     from prospector_runs where id = $1`,
    [runId]
  );
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const run = rows[0];

  const eventsResult = await pool.query(
    `select action, payload, created_at
     from audit_log
     where agent = 'prospector'
       and (
         payload->>'run_id' = $1
         or (
           payload->>'zip' = $2
           and payload->>'metro' = $3
           and created_at >= $4
         )
       )
     order by created_at desc
     limit 10`,
    [runId, run.zip, run.metro, run.started_at]
  );

  return NextResponse.json({
    ...run,
    events: eventsResult.rows,
  });
}
