import { neon } from "@neondatabase/serverless";

import { getOptionalEnv } from "@/lib/env";
import { ContactInput } from "@/lib/validation";

export type LeadRecord = {
  id: string;
  name: string;
  businessName: string;
  email: string;
  website: string | null;
  industry: string;
  message: string;
  status: string;
  source: string;
  createdAt: string;
};

const fallbackLeads: LeadRecord[] = [
  {
    id: "mock-1",
    name: "Avery Clark",
    businessName: "Summit Dental",
    email: "avery@example.com",
    website: "https://summitdental.example",
    industry: "Other",
    message: "Need better conversion from mobile traffic.",
    status: "new",
    source: "Free Site Audit",
    createdAt: new Date().toISOString()
  },
  {
    id: "mock-2",
    name: "Jordan Mills",
    businessName: "Peak HVAC",
    email: "jordan@example.com",
    website: "https://peakhvac.example",
    industry: "Contractor",
    message: "Need same-day service lead flow and stronger trust.",
    status: "contacted",
    source: "Contact Form",
    createdAt: new Date().toISOString()
  }
];

function getDb() {
  const connectionString = getOptionalEnv("DATABASE_URL");
  if (!connectionString) return null;
  return neon(connectionString);
}

export async function createLead(input: ContactInput, source = "Free Site Audit"): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db`
    insert into leads (name, business_name, email, website, industry, message, status, source)
    values (${input.name}, ${input.businessName}, ${input.email}, ${input.website || null}, ${input.industry}, ${input.message}, 'new', ${source})
  `;
}

export async function getRecentLeads(limit = 25): Promise<LeadRecord[]> {
  const db = getDb();
  if (!db) return fallbackLeads;

  const rows = await db`
    select
      id::text as id,
      name,
      business_name as "businessName",
      email,
      website,
      industry,
      message,
      status,
      source,
      created_at::text as "createdAt"
    from leads
    order by created_at desc
    limit ${limit}
  `;
  return rows as LeadRecord[];
}

export const LEADS_SCHEMA_SQL = `
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text not null,
  email text not null,
  website text,
  industry text not null,
  message text not null,
  status text not null default 'new',
  source text not null default 'Free Site Audit',
  created_at timestamptz not null default now()
);
`;
