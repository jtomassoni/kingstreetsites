import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureBillingSchema } from "@/lib/billing";
import { ensureOutreachSchema } from "@/lib/outreach-schema";
import { getInvoiceEmailDraft, InvoiceSendError } from "@/lib/invoice-email";
import { textToEmailHtml } from "@/lib/outreach-email";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const comments = req.nextUrl.searchParams.get("comments");
  await ensureBillingSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  try {
    const draft = await getInvoiceEmailDraft(dbPool, id, { comments });
    return NextResponse.json({
      ok: true,
      ...draft,
      html: textToEmailHtml(draft.message),
    });
  } catch (err) {
    if (err instanceof InvoiceSendError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "Failed to load preview";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
