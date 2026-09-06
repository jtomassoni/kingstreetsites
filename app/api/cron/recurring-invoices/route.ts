import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { processDueScheduledInvoices } from "@/lib/invoice-email";

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const session = await auth();
  return Boolean(session);
}

/** Generate due recurring invoices and auto-send any with auto-send enabled. */
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let created = 0;
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < 10; i++) {
      const result = await processDueScheduledInvoices(dbPool, { createdBy: "cron" });
      created += result.created;
      sent += result.sent;
      failed += result.failed;
      if (result.created === 0) break;
    }
    return NextResponse.json({ ok: true, created, sent, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process recurring invoices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
