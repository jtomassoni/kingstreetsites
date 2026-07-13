import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  await ensureLeadCrmSchema(dbPool);

  const updates: string[] = [];
  const values: unknown[] = [];

  if ("contact_email" in body) {
    const email = clean(body.contact_email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
    }
    values.push(email);
    updates.push(`contact_email = $${values.length}`);
  }
  if ("phone" in body) {
    values.push(clean(body.phone));
    updates.push(`phone = $${values.length}`);
  }
  if ("website_url" in body) {
    values.push(clean(body.website_url));
    updates.push(`website_url = $${values.length}`);
  }
  if ("barter_payments_enabled" in body) {
    if (typeof body.barter_payments_enabled !== "boolean") {
      return NextResponse.json({ error: "barter_payments_enabled must be a boolean" }, { status: 400 });
    }
    values.push(body.barter_payments_enabled);
    updates.push(`barter_payments_enabled = $${values.length}`);
  }

  if (!updates.length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);
  const result = await dbPool.query(
    `update leads
     set ${updates.join(", ")}, updated_at = now()
     where id = $${values.length}
     returning id, contact_email, phone, website_url, barter_payments_enabled`,
    values
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lead: result.rows[0] });
}
