import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { dollarsToCents } from "@/lib/billing";
import {
  EXPENSE_CATEGORIES,
  ensureTaxSchema,
  type ExpenseCategory,
} from "@/lib/tax";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear();

  const pool = getDbPool();
  await ensureTaxSchema(pool);
  const { rows } = await pool.query(
    `select
       id,
       incurred_on::text as incurred_on,
       category,
       description,
       vendor,
       amount_cents,
       recurring,
       notes,
       created_at::text as created_at,
       updated_at::text as updated_at
     from business_expenses
     where extract(year from incurred_on) = $1
     order by incurred_on desc, created_at desc`,
    [year]
  );
  return NextResponse.json({ expenses: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const incurredOn = typeof body.incurred_on === "string" ? body.incurred_on.slice(0, 10) : "";
  const category = body.category as ExpenseCategory;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const vendor = typeof body.vendor === "string" ? body.vendor.trim() || null : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const recurring = Boolean(body.recurring);

  let amountCents = 0;
  if (typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)) {
    amountCents = Math.round(body.amount_cents);
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    amountCents = dollarsToCents(body.amount);
  } else if (typeof body.amount === "string" && body.amount.trim()) {
    amountCents = dollarsToCents(Number(body.amount));
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) {
    return NextResponse.json({ error: "incurred_on must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }

  const pool = getDbPool();
  await ensureTaxSchema(pool);
  const { rows } = await pool.query(
    `insert into business_expenses
       (incurred_on, category, description, vendor, amount_cents, recurring, notes)
     values ($1, $2, $3, $4, $5, $6, $7)
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
    [incurredOn, category, description, vendor, amountCents, recurring, notes]
  );

  return NextResponse.json({ expense: rows[0] }, { status: 201 });
}
