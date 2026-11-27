-- DEPRECATED — do not re-grant broad public access to public.vigil_hearts.
--
-- The old script granted SELECT/UPDATE/INSERT to anon and authenticated and
-- recreated wide policies. That exposed owner_id and intention and allowed
-- direct writes. Vigil writes now go through the signed server route, and the
-- public projection is column-level:
--
--   id, owner_name, last_lit_at, is_locked, created_at, updated_at
--
-- See migrations/2026-10-30_security_hardening_private_data.sql and
-- migrations/2026-11-27_temple_privacy_hardening.sql.
--
-- Read-only verification (safe to run):
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_table_select,
  has_column_privilege('anon', c.oid, 'owner_id', 'SELECT') as anon_owner_id_select,
  has_column_privilege('anon', c.oid, 'intention', 'SELECT') as anon_intention_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'vigil_hearts';
