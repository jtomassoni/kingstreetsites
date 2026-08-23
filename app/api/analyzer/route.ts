import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { dispatchAnalyzerRun } from "@/lib/agent-dispatch";
import { getDbPool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.limit);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 5000) : 200;

  const pool = getDbPool();
  const { rows } = await pool.query(
    `insert into analyzer_runs (zip, metro, status, current_business)
     values ('ALL', 'ALL', 'running', 'Queued…')
     returning id`,
    []
  );
  const runId = rows[0].id as string;

  const started = await dispatchAnalyzerRun({
    runId,
    limit: String(limit),
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
    return NextResponse.json({ error: started.error, runId }, { status: 503 });
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

  return NextResponse.json({ ok: true, runId, limit });
}
