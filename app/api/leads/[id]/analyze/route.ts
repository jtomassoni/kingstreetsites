import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { dispatchAnalyzerRun } from "@/lib/agent-dispatch";
import { getDbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const pool = getDbPool();
  await ensureOutreachSchema(pool);

  const leadResult = await pool.query(
    `select id, business_name, analysis_status
     from leads
     where id = $1`,
    [id]
  );
  const lead = leadResult.rows[0] as
    | { id: string; business_name: string; analysis_status: string }
    | undefined;

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!["pending", "failed"].includes(lead.analysis_status)) {
    return NextResponse.json(
      { error: "Lead already analyzed. Status must be pending or failed." },
      { status: 409 }
    );
  }

  if (lead.analysis_status === "failed") {
    await pool.query(
      `update leads
       set analysis_status = 'pending', analysis_error = null, updated_at = now()
       where id = $1`,
      [id]
    );
  }

  const { rows } = await pool.query(
    `insert into analyzer_runs (zip, metro, status, current_business)
     values ('ALL', 'ALL', 'running', 'Queued…')
     returning id`,
    []
  );
  const runId = rows[0].id as string;

  await pool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'analysis_started', 'Site analysis started', $2, $3::jsonb)`,
    [
      id,
      lead.business_name,
      JSON.stringify({
        run_id: runId,
        source: "lead_detail",
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  const started = await dispatchAnalyzerRun({
    runId,
    limit: "1",
    leadId: id,
    onSpawnError: async (message) => {
      await getDbPool().query(
        `update analyzer_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
        [message, runId]
      );
    },
  });

  if (!started.ok) {
    await pool.query(
      `update analyzer_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
      [started.error, runId]
    );
    return NextResponse.json({ error: started.error, runId, leadId: id }, { status: 503 });
  }

  await pool.query(
    `update analyzer_runs set current_business = $1 where id = $2 and status = 'running'`,
    [
      process.env.VERCEL || process.env.USE_GITHUB_AGENTS === "1"
        ? "Queued on GitHub Actions…"
        : "Worker starting…",
      runId,
    ]
  );

  return NextResponse.json({ ok: true, runId, leadId: id });
}
