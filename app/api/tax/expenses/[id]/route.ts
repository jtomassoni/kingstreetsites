import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { dollarsToCents } from "@/lib/billing";
import {
  EXPENSE_CATEGORIES,
  ensureTaxSchema,
  type ExpenseCategory,
} from "@/lib/tax";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.incurred_on === "string") {
    const incurredOn = body.incurred_on.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) {
      return NextResponse.json({ error: "incurred_on must be YYYY-MM-DD" }, { status: 400 });
    }
    values.push(incurredOn);
    updates.push(`incurred_on = $${values.length}`);
  }

  if (typeof body.category === "string") {
    if (!EXPENSE_CATEGORIES.includes(body.category as ExpenseCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    values.push(body.category);
    updates.push(`category = $${values.length}`);
  }

  if (typeof body.description === "string") {
    const description = body.description.trim();
    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    values.push(description);
    updates.push(`description = $${values.length}`);
  }

  if ("vendor" in body) {
    values.push(typeof body.vendor === "string" ? body.vendor.trim() || null : null);
    updates.push(`vendor = $${values.length}`);
  }

  if ("notes" in body) {
    values.push(typeof body.notes === "string" ? body.notes.trim() || null : null);
    updates.push(`notes = $${values.length}`);
  }

  if ("recurring" in body) {
    values.push(Boolean(body.recurring));
    updates.push(`recurring = $${values.length}`);
  }

  if ("amount_cents" in body || "amount" in body) {
    let amountCents = 0;
    if (typeof body.amount_cents === "number") amountCents = Math.round(body.amount_cents);
    else if (typeof body.amount === "number") amountCents = dollarsToCents(body.amount);
    else if (typeof body.amount === "string") amountCents = dollarsToCents(Number(body.amount));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    values.push(amountCents);
    updates.push(`amount_cents = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.push("updated_at = now()");
  values.push(id);

  const pool = getDbPool();
  await ensureTaxSchema(pool);
  const { rows } = await pool.query(
    `update business_expenses
     set ${updates.join(", ")}
     where id = $${values.length}
     returning
       id,
       incurred_on::text as incurred_on,
       category,
       description,
       vendor,
       amount_cents,
       recurring,
       notes,
       created_at::text as created_at,
       updated_at::text as updated_at`,
    values
  );

  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ expense: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const pool = getDbPool();
  await ensureTaxSchema(pool);
  const { rowCount } = await pool.query(`delete from business_expenses where id = $1`, [id]);
  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
