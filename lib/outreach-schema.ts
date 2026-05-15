import { Pool } from "pg";

let ensured = false;

export async function ensureOutreachSchema(pool: Pool) {
  if (ensured) return;

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
  `);

  ensured = true;
}
