import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureBillingSchema } from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { InvoiceSendError, sendInvoiceEmail } from "@/lib/invoice-email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const comments = typeof body.comments === "string" ? body.comments : null;
  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  try {
    const result = await sendInvoiceEmail(dbPool, id, {
      by: session.user?.email ?? "unknown",
      comments,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InvoiceSendError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Failed to send invoice";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
