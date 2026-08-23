-- Site issue screenshots per lead (for pitch email highlights)
create table if not exists lead_site_issues (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  image_url text not null,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lead_site_issues_lead_id_idx on lead_site_issues (lead_id, sort_order, created_at);
