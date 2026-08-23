import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import {
  ensureInvoiceTemplatesSchema,
  parseTemplateAmountDollars,
  dollarsToCents,
} from "@/lib/invoice-templates";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await ensureInvoiceTemplatesSchema(dbPool);

  const updates: string[] = [];
  const values: unknown[] = [];

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Invoice title is required" }, { status: 400 });
    values.push(title);
    updates.push(`title = $${values.length}`);
  }
  if ("amount" in body) {
    const amountDollars = parseTemplateAmountDollars(body.amount);
    if (amountDollars === null) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    values.push(dollarsToCents(amountDollars));
    updates.push(`amount_cents = $${values.length}`);
  }
  if ("notes" in body) {
    values.push(typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null);
    updates.push(`notes = $${values.length}`);
  }
  if ("sort_order" in body && Number.isFinite(Number(body.sort_order))) {
    values.push(Number(body.sort_order));
    updates.push(`sort_order = $${values.length}`);
  }

  if (!updates.length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);
  const { rows } = await dbPool.query(
    `update invoice_templates
     set ${updates.join(", ")}, updated_at = now()
     where id = $${values.length}
     returning id, name, title, amount_cents, currency, notes, sort_order, created_at, updated_at`,
    values
  );

  if (!rows[0]) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json({ ok: true, template: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await ensureInvoiceTemplatesSchema(dbPool);

  const { rows } = await dbPool.query(
    `delete from invoice_templates where id = $1 returning id`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
