import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbPool } from "@/lib/db";
import { ensureLeadCrmSchema } from "@/lib/lead-schema";
import { ensureOutreachSchema } from "@/lib/outreach-schema";

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessName = clean(body?.business_name);
  if (!businessName) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }

  const contactEmail = clean(body?.contact_email);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
  }

  await ensureLeadCrmSchema(dbPool);
  await ensureOutreachSchema(dbPool);

  const phone = clean(body?.phone);
  const websiteUrl = clean(body?.website_url);
  const address = clean(body?.address);
  const metro = clean(body?.metro);
  const zip = clean(body?.zip);
  const cuisine = clean(body?.cuisine);

  const result = await dbPool.query(
    `insert into leads (
       business_name, contact_email, phone, website_url, address, metro, zip, cuisine,
       analysis_status, status
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'new')
     returning id, business_name, contact_email, status`,
    [businessName, contactEmail, phone, websiteUrl, address, metro, zip, cuisine]
  );

  const lead = result.rows[0];

  await dbPool.query(
    `insert into lead_timeline_events (lead_id, event_type, title, body, metadata)
     values ($1, 'lead_created', 'Lead added manually', $2, $3::jsonb)`,
    [
      lead.id,
      businessName,
      JSON.stringify({
        source: "manual",
        by: session.user?.email ?? "unknown",
      }),
    ]
  );

  return NextResponse.json({ ok: true, lead }, { status: 201 });
}
