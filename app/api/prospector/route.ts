import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { dispatchProspectorRun } from "@/lib/agent-dispatch";
import { getDbPool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { zip, metro } = await req.json();
  if (!zip) return NextResponse.json({ error: "zip required" }, { status: 400 });

  const pool = getDbPool();
  const { rows } = await pool.query(
    `insert into prospector_runs (zip, metro, status, current_business)
     values ($1, $2, 'running', 'Queued…')
     returning id`,
    [zip, metro ?? "Denver"]
  );
  const runId = rows[0].id as string;

  const started = await dispatchProspectorRun({
    runId,
    zip,
    metro: metro ?? "Denver",
    onSpawnError: async (message) => {
      await getDbPool().query(
        `update prospector_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
        [message, runId]
      );
    },
  });

  if (!started.ok) {
    await pool.query(
      `update prospector_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
      [started.error, runId]
    );
    return NextResponse.json({ error: started.error, runId }, { status: 503 });
  }

  await pool.query(
    `update prospector_runs set current_business = $1 where id = $2 and status = 'running'`,
    [
      process.env.VERCEL || process.env.USE_GITHUB_AGENTS === "1"
        ? "Queued on GitHub Actions…"
        : "Worker starting…",
      runId,
    ]
  );

  return NextResponse.json({ ok: true, runId });
}
