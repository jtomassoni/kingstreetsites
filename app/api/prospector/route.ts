import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { zip, metro } = await req.json();
  if (!zip) return NextResponse.json({ error: "zip required" }, { status: 400 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Create run record first so the UI has something to poll
  const { rows } = await pool.query(
    "insert into prospector_runs (zip, metro) values ($1, $2) returning id",
    [zip, metro ?? "Denver"]
  );
  await pool.end();
  const runId = rows[0].id as string;

  const scriptPath = path.join(process.cwd(), "agents/prospector/main.py");
  const logPath = path.join(process.cwd(), "agents/prospector/worker.log");
  let logFd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFd = fs.openSync(logPath, "a");
    fs.writeSync(
      logFd,
      `\n--- ${new Date().toISOString()} spawn runId=${runId} zip=${zip} metro=${metro ?? "Denver"}\n`
    );
  } catch {
    logFd = null;
  }

  const child = spawn("python3", [scriptPath, zip, metro ?? "Denver", runId], {
    detached: true,
    stdio: logFd !== null ? (["ignore", logFd, logFd] as const) : "ignore",
    env: { ...process.env },
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
    const failPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await failPool.query(
        `update prospector_runs set status = 'failed', error = $1, finished_at = now() where id = $2`,
        [`Could not start Python worker: ${err instanceof Error ? err.message : String(err)}`, runId]
      );
    } finally {
      await failPool.end();
    }
  });

  child.unref();
  if (logFd !== null) {
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true, runId });
}
