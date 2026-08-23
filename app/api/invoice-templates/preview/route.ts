import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dollarsToCents } from "@/lib/billing";
import { buildInvoiceEmailPreviewFromTemplate } from "@/lib/invoice-email";
import { parseTemplateAmountDollars } from "@/lib/invoice-templates";
import { textToEmailHtml } from "@/lib/outreach-email";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const amountDollars = parseTemplateAmountDollars(body.amount);
  if (!title) {
    return NextResponse.json({ error: "Invoice title is required for preview" }, { status: 400 });
  }
  if (amountDollars === null) {
    return NextResponse.json({ error: "Valid amount is required for preview" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const draft = buildInvoiceEmailPreviewFromTemplate({
    title,
    amountCents: dollarsToCents(amountDollars),
    notes,
  });

  return NextResponse.json({
    ok: true,
    subject: draft.subject,
    message: draft.message,
    html: textToEmailHtml(draft.message),
  });
}
