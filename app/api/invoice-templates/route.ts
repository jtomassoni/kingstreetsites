import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureInvoiceTemplatesSchema,
  listInvoiceTemplates,
  parseTemplateAmountDollars,
  dollarsToCents,
} from "@/lib/invoice-templates";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await listInvoiceTemplates(dbPool);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!name) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Invoice title is required" }, { status: 400 });

  const amountDollars = parseTemplateAmountDollars(body.amount);
  if (amountDollars === null) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

  await ensureInvoiceTemplatesSchema(dbPool);

  const { rows } = await dbPool.query(
    `insert into invoice_templates (name, title, amount_cents, notes, recurring, frequency, sort_order)
     values ($1, $2, $3, $4, false, null, $5)
     returning id, name, title, amount_cents, currency, notes, sort_order, created_at, updated_at`,
    [name, title, dollarsToCents(amountDollars), notes, sortOrder]
  );

  return NextResponse.json({ ok: true, template: rows[0] }, { status: 201 });
}
