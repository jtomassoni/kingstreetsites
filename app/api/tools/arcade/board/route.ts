import { denverDay } from "@arcade/game/daily";
import type { Bucket, FormatId } from "@arcade/game/types";
import { postScore, readScores } from "@arcade/server/board";
import { requireToolsUser } from "@/lib/tools/auth/session";
import { ToolsAuthError } from "@/lib/tools/auth/session";

export const runtime = "nodejs";

function sameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!host) return false;
  if (!origin) {
    // Same-origin navigations / some browsers omit Origin on GET
    return request.method === "GET";
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function requireToolsApiUser() {
  try {
    return await requireToolsUser();
  } catch (e) {
    if (e instanceof ToolsAuthError) {
      return null;
    }
    throw e;
  }
}

export async function GET(request: Request) {
  const user = await requireToolsApiUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const destination = url.searchParams.get("destination") || "colorado";
  const format = (url.searchParams.get("format") || "push") as FormatId;
  const bucket = (url.searchParams.get("bucket") || "free") as Bucket;
  const day = url.searchParams.get("day") || denverDay();
  try {
    const rows = await readScores(bucket, destination, format, day);
    return Response.json({ rows, shared: true });
  } catch {
    return Response.json({ rows: [], shared: false });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  }

  const user = await requireToolsApiUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The score never arrived." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "The score never arrived." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const result = await postScore({
    gamertag: String(input.gamertag ?? ""),
    secret: typeof input.secret === "string" ? input.secret : undefined,
    destination: String(input.destination ?? ""),
    format: input.format === "gauntlet" ? "gauntlet" : "push",
    bucket: input.bucket === "daily" ? "daily" : "free",
    day: String(input.day ?? ""),
    score: Number(input.score),
    hearts: Number(input.hearts ?? 0),
    chain: Number(input.chain ?? 0),
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result);
}
