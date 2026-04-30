import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { Pool } from "pg";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { zip, metro } = await req.json();
  if (!zip) return NextResponse.json({ error: "zip required" }, { status: 400 });

  // Create run record first so the UI has something to poll
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    "insert into prospector_runs (zip, metro) values ($1, $2) returning id",
    [zip, metro ?? "Denver"]
  );
  await pool.end();
  const runId = rows[0].id as string;

  const scriptPath = path.join(process.cwd(), "agents/prospector/main.py");
  const child = spawn("python3", [scriptPath, zip, metro ?? "Denver", runId], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  return NextResponse.json({ ok: true, runId });
}
