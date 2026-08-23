import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getDbPool } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.limit);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 5000) : 200;

  const pool = getDbPool();
  const { rows } = await pool.query(
    "insert into analyzer_runs (zip, metro) values ('ALL', 'ALL') returning id",
    []
  );
  const runId = rows[0].id as string;

  const scriptPath = path.join(process.cwd(), "agents/analyzer/main.py");
  const logPath = path.join(process.cwd(), "agents/analyzer/worker.log");
  let logFd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFd = fs.openSync(logPath, "a");
    fs.writeSync(
      logFd,
      `\n--- ${new Date().toISOString()} analyzer runId=${runId} limit=${limit}\n`
    );
  } catch {
    logFd = null;
  }

  const child = spawn("python3", [scriptPath, runId, String(limit)], {
    detached: true,
    stdio: logFd !== null ? (["ignore", logFd, logFd] as const) : "ignore",
    env: { ...process.env, ANALYZER_LIMIT: String(limit) },
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

  return NextResponse.json({ ok: true, runId, limit });
}
