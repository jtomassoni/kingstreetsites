import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncReceivedEmails } from "@/lib/inbound-email";

/** Pull recent Resend received emails into CRM threads (local backfill / missed webhooks). */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await syncReceivedEmails({ limit: 40 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
