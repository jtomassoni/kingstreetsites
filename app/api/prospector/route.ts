import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { zip, metro } = await req.json();
  if (!zip) return NextResponse.json({ error: "zip required" }, { status: 400 });

  const scriptPath = path.join(process.cwd(), "agents/prospector/main.py");

  const child = spawn("python3", [scriptPath, zip, metro ?? "Denver"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  return NextResponse.json({ ok: true, message: `Prospector started for ZIP ${zip}` });
}
