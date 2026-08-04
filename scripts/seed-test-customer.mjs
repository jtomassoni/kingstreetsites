#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

function loadDotEnv(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv(envPath);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`alter table leads add column if not exists contact_email text`);
await pool.query(`
  create table if not exists lead_notes (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    note text not null,
    created_by text,
    created_at timestamptz not null default now()
  );
  create table if not exists lead_messages (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    direction text not null check (direction in ('outbound','inbound')),
    channel text not null default 'email' check (channel in ('email')),
    from_email text,
    to_email text,
    subject text,
    body_text text,
    body_html text,
    provider text,
    provider_message_id text,
    created_at timestamptz not null default now()
  );
  create table if not exists lead_timeline_events (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    event_type text not null,
    title text not null,
    body text,
    metadata jsonb,
    created_at timestamptz not null default now()
  );
  create table if not exists invoices (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid not null references leads(id) on delete cascade,
    invoice_number text not null unique,
    title text not null default 'Website project',
    amount_cents int not null check (amount_cents >= 0),
    currency text not null default 'usd',
    status text not null default 'draft'
      check (status in ('draft', 'sent', 'paid', 'void', 'overdue')),
    due_date date,
    notes text,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists invoice_payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references invoices(id) on delete cascade,
    amount_cents int not null check (amount_cents > 0),
    method text not null default 'other'
      check (method in ('card', 'check', 'cash', 'transfer', 'other')),
    paid_at timestamptz not null default now(),
    notes text,
    created_at timestamptz not null default now()
  );
`);

await pool.query(`
  delete from leads
  where business_name in ('Root Down', 'King Street Test Resto')
    and zip in ('80211', '80202')
`);

const { rows } = await pool.query(`
  insert into leads (
    business_name, metro, zip, address, phone, contact_email, website_url, cuisine,
    google_rating, google_review_count, site_grade, pitch_angle,
    looks_modern, mobile_ready, accessibility_ok, has_online_ordering, has_reservations, has_real_menu,
    business_viability, web_pain, opportunity_score, tier,
    analysis_status, analyzed_at, status
  ) values (
    'King Street Test Resto',
    'Denver',
    '80202',
    '1234 Test St, Denver, CO 80202',
    '(303) 555-0199',
    'test@kingstreetsites.com',
    'https://example.com/king-street-test-resto',
    'Test / New American',
    4.5, 128, 'C',
    'FAKE TEST CUSTOMER — safe to poke around. Pretend site needs a menu + reservations refresh.',
    false, false, true, false, true, true,
    82, 68, 74, 'A',
    'complete', now() - interval '12 days', 'closed_won'
  )
  returning id, business_name, status, contact_email
`);

const id = rows[0].id;

await pool.query(
  `
  insert into lead_timeline_events (lead_id, event_type, title, body, metadata, created_at) values
    ($1, 'lead_created', 'Lead added', 'Seeded for CRM testing', '{"source":"seed"}'::jsonb, now() - interval '21 days'),
    ($1, 'status_changed', 'Status updated', 'Set status to "reached out"', '{"status":"reached_out"}'::jsonb, now() - interval '18 days'),
    ($1, 'status_changed', 'Status updated', 'Set status to "replied"', '{"status":"replied"}'::jsonb, now() - interval '16 days'),
    ($1, 'status_changed', 'Status updated', 'Set status to "closed won"', '{"status":"closed_won"}'::jsonb, now() - interval '10 days')
`,
  [id]
);

await pool.query(
  `
  insert into lead_notes (lead_id, note, created_by, created_at) values
    ($1, 'Spoke with Test Contact (fake GM). They want a redesign before patio season — ownership decides. Budget roughly $4–6k. THIS IS A FAKE TEST CUSTOMER.', 'seed', now() - interval '15 days'),
    ($1, 'Won the project. Scope: homepage, menu, events, reservations CTA. Deposit invoice paid; final balance still open. Safe to mess with.', 'seed', now() - interval '10 days')
`,
  [id]
);

await pool.query(
  `
  insert into lead_messages (lead_id, direction, channel, from_email, to_email, subject, body_text, provider, created_at) values
    ($1, 'outbound', 'email', 'jt@kingstreetsites.com', 'test@kingstreetsites.com',
     'Quick idea for King Street Test Resto',
     $2, 'seed', now() - interval '18 days'),
    ($1, 'inbound', 'email', 'test@kingstreetsites.com', 'jt@kingstreetsites.com',
     'Re: Quick idea for King Street Test Resto',
     $3, 'seed', now() - interval '16 days'),
    ($1, 'outbound', 'email', 'jt@kingstreetsites.com', 'test@kingstreetsites.com',
     'Re: Quick idea for King Street Test Resto',
     $4, 'seed', now() - interval '15 days'),
    ($1, 'inbound', 'email', 'test@kingstreetsites.com', 'jt@kingstreetsites.com',
     'Re: Quick idea for King Street Test Resto',
     $5, 'seed', now() - interval '11 days')
`,
  [
    id,
    `Hey Test Contact —

[FAKE] Noticing the site makes it harder than it should be to check the menu and book.

Happy to sketch a simpler homepage + mobile menu flow if useful.

— JT`,
    `JT — thanks for reaching out. [FAKE REPLY] We've been meaning to redo the site. Can you send a rough range and timeline?

Test Contact`,
    `Test Contact —

For a focused rebuild (home, menu, events, reservation CTA) we're usually in the $4.5–6k range, about 3–4 weeks.

— JT`,
    `Let's do it. [FAKE] Ownership approved. Send the proposal + deposit invoice.

Test Contact`,
  ]
);

const inv = await pool.query(
  `
  insert into invoices (lead_id, invoice_number, title, amount_cents, status, due_date, notes, paid_at, created_at)
  values
    ($1, 'KSS-2026-SEED1', 'King Street Test Resto — 50% deposit', 250000, 'paid',
     (now() - interval '8 days')::date, 'TEST deposit invoice — safe to edit',
     now() - interval '7 days', now() - interval '10 days'),
    ($1, 'KSS-2026-SEED2', 'King Street Test Resto — final balance', 250000, 'sent',
     (now() + interval '14 days')::date, 'TEST final balance — still open', null, now() - interval '2 days')
  returning id, invoice_number, status, amount_cents
`,
  [id]
);

const paid = inv.rows.find((r) => r.status === "paid");
if (paid) {
  await pool.query(
    `insert into invoice_payments (invoice_id, amount_cents, method, notes, paid_at)
     values ($1, 250000, 'transfer', 'ACH deposit', now() - interval '7 days')`,
    [paid.id]
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      lead: rows[0],
      url: `http://localhost:3000/admin/leads/${id}`,
      customers: "http://localhost:3000/admin/leads?view=customers",
      invoices: inv.rows,
    },
    null,
    2
  )
);

await pool.end();
