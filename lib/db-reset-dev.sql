-- DEV ONLY: wipe leads pipeline data. Keeps users / sessions / settings.
-- Run: npm run db:reset-dev
--
-- Clears: prospector_runs, analyzer_runs, social_connections (if present),
--         leads + all rows in tables that reference leads (notes, messages,
--         timeline, audit_log entries — entire audit_log is truncated as part
--         of CASCADE because audit_log.lead_id references leads).

begin;

truncate table prospector_runs;

do $$
begin
  if to_regclass('public.analyzer_runs') is not null then
    execute 'truncate table analyzer_runs';
  end if;
end $$;

do $$
begin
  if to_regclass('public.social_connections') is not null then
    execute 'truncate table social_connections';
  end if;
end $$;

truncate table leads cascade;

commit;
