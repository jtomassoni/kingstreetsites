import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getDbPool } from "@/lib/db";
import fs from "fs";
import path from "path";
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

  // Ensure a failed lead is eligible for the pending queue as well as lead_id targeting.
  if (lead.analysis_status === "failed") {
    await pool.query(
      `update leads
       set analysis_status = 'pending', analysis_error = null, updated_at = now()
       where id = $1`,
      [id]
    );
  }

  const { rows } = await pool.query(
    "insert into analyzer_runs (zip, metro) values ('ALL', 'ALL') returning id",
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

  const scriptPath = path.join(process.cwd(), "agents/analyzer/main.py");
  const logPath = path.join(process.cwd(), "agents/analyzer/worker.log");
  let logFd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFd = fs.openSync(logPath, "a");
    fs.writeSync(
      logFd,
      `\n--- ${new Date().toISOString()} analyzer runId=${runId} leadId=${id} limit=1\n`
    );
  } catch {
    logFd = null;
  }

  const child = spawn("python3", [scriptPath, runId, "1"], {
    detached: true,
    stdio: logFd !== null ? (["ignore", logFd, logFd] as const) : "ignore",
    env: {
      ...process.env,
      ANALYZER_LIMIT: "1",
      ANALYZER_LEAD_ID: id,
      ANALYZER_MAX_WORKERS: "1",
    },
  });

  child.on("error", async (err) => {
    if (logFd !== null) {
      try {
        fs.writeSync(logFd, `spawn error: ${err instanceof Error ? err.message : String(err)}\n`);
      } catch {
        /* ignore */
      }
      try {
        fs.closeSync(logFd);
      } catch {
        /* ignore */
      }
      logFd = null;
    }
    await getDbPool().query(
      `update analyzer_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
      [`Could not start analyzer worker: ${err instanceof Error ? err.message : String(err)}`, runId]
    );
  });

  child.unref();
  if (logFd !== null) {
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true, runId, leadId: id });
}
