import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

export type LeadMessageRow = {
  id: string;
  direction: "outbound" | "inbound";
  channel: string;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  created_at: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureOutreachSchema(dbPool);

  const { rows } = await dbPool.query<LeadMessageRow>(
    `select id, direction, channel, from_email, to_email, subject, body_text, created_at
     from lead_messages
     where lead_id = $1
     order by created_at asc`,
    [id]
  );

  return NextResponse.json({ messages: rows });
}
