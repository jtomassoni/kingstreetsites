import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return new NextResponse("Missing path", { status: 400 });

  // Only allow paths within the agents/prospector/screenshots dir
  const allowed = path.join(process.cwd(), "agents/prospector/screenshots");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowed)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved)) return new NextResponse("Not found", { status: 404 });

  const buffer = fs.readFileSync(resolved);
  return new NextResponse(buffer, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
