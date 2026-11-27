-- Read-only Temple / Chronicles / Vigil schema, RLS, grant and index audit.
-- Run against a staging replica or production with a read-only connection.
-- This file contains no INSERT/UPDATE/DELETE/DDL and must never be applied as
-- a migration.

-- 1. Managed migration history.
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;

-- 2. Tables, views and RLS state.
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'p' then 'partitioned_table'
    else c.relkind::text
  end as object_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    c.relname like 'temple%'
    or c.relname like 'vigil%'
    or c.relname like 'telegram_group_vigil%'
  )
order by c.relname;

-- 3. Columns, types, nullability and defaults.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  identity_generation
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'temple_log',
    'temple_chronicle_signals',
    'temple_users',
    'vigil_hearts',
    'vigil_spark_claims',
    'vigil_spark_stats',
    'temple_analytics_events',
    'temple_analytics_sessions'
  )
order by table_name, ordinal_position;

-- 4. Constraints (PK/FK/unique/check) and their validation state.
select
  conrelid::regclass as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition,
  convalidated
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'public.temple_log',
    'public.temple_chronicle_signals',
    'public.temple_users',
    'public.vigil_hearts',
    'public.vigil_spark_claims',
    'public.vigil_spark_stats',
    'public.temple_analytics_events',
    'public.temple_analytics_sessions'
  )
order by conrelid::regclass::text, contype, conname;

-- 5. Indexes, including duplicates and unused indexes.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'temple_log',
    'temple_chronicle_signals',
    'temple_users',
    'vigil_hearts',
    'vigil_spark_claims',
    'vigil_spark_stats',
    'temple_analytics_events',
    'temple_analytics_sessions'
  )
order by tablename, indexname;

select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where schemaname = 'public'
  and relname in (
    'temple_log',
    'temple_chronicle_signals',
    'vigil_hearts',
    'vigil_spark_claims'
  )
order by relname, idx_scan asc, indexrelname;

-- 6. Policies.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'temple_log',
    'temple_chronicle_signals',
    'temple_users',
    'vigil_hearts',
    'vigil_spark_claims'
  )
order by tablename, policyname;

-- 7. Table and column grants for client roles.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'temple_log',
    'temple_chronicle_signals',
    'temple_users',
    'vigil_hearts',
    'vigil_spark_claims'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  table_name,
  column_name,
  grantee,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in (
    'temple_log',
    'temple_chronicle_signals',
    'temple_users',
    'vigil_hearts',
    'vigil_spark_claims'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, column_name, grantee, privilege_type;

-- 8. SECURITY DEFINER functions, search_path and client EXECUTE.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;

-- 9. Triggers.
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'temple_log',
    'vigil_spark_claims',
    'vigil_hearts'
  )
order by event_object_table, trigger_name;

-- 10. Realtime publication membership (which raw rows can be broadcast).
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

-- 11. Duplicate or orphan signals. Read-only evidence for a conservative
-- follow-up; never delete from this file.
select log_id, count(*) as signal_rows
from public.temple_chronicle_signals
group by log_id
having count(*) > 1
order by signal_rows desc;

select s.id, s.log_id, s.occurred_at
from public.temple_chronicle_signals s
left join public.temple_log l on l.id::text = s.log_id
where l.id is null
order by s.id desc
limit 100;

-- 12. Heart ids outside the legacy 1..5 range (should be zero before the cap
-- is removed, and legal afterwards).
select id, count(*)
from public.vigil_hearts
group by id
order by id;
