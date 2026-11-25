-- DEPRECATED — do not re-open public reads on public.temple_log.
--
-- Temple Chronicles now reads through the server route using the service role,
-- and the browser receives only the public-safe realtime signal:
--
--   public.temple_chronicle_signals (event_type, public_name, occurred_at)
--
-- See migrations/2026-11-25_temple_chronicles_public_memory.sql.
-- Running the old policy below would expose user_id, legacy confession text and
-- every stored row to the anon key again, so it has been removed intentionally.

-- Read-only verification (safe to run):
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('temple_log', 'temple_chronicle_signals')
order by c.relname;
