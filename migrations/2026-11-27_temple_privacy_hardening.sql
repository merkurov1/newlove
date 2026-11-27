-- Temple privacy hardening and Chronicle idempotency.
--
-- Forward-only and idempotent. This migration does not delete or rewrite any
-- historical row. It closes the remaining public exposure identified in the
-- 2026-11-27 audit and makes the public Chronicle signal idempotent.
--
-- 1. temple_log: drop the stale `public_select_on_temple_log` policy and any
--    older public-read policy. RLS stays enabled and the table remains
--    service-role only for the server feed routes.
--
-- 2. temple_chronicle_signals: the trigger is the only writer. It is now
--    idempotent per temple_log id (`where not exists`) and direct client
--    EXECUTE is revoked. Existing duplicate signal rows are preserved.
--
-- 3. vigil_hearts: the obsolete five-heart product cap is removed. Public
--    clients receive column-level SELECT on the public-safe columns only;
--    owner_id and intention stay private. The raw row is removed from the
--    public Realtime publication, because Realtime would otherwise broadcast
--    those private columns. The public-safe `temple_chronicle_signals` feed is
--    the realtime hint for VIGIL_SPARK.
--
-- 4. Both SECURITY DEFINER trigger functions use an empty search_path and are
--    no longer executable by anon/authenticated clients.

begin;

-- ---------------------------------------------------------------------------
-- 1. temple_log is server-only.
-- ---------------------------------------------------------------------------
alter table if exists public.temple_log
  add column if not exists is_public_identity boolean not null default false;

alter table if exists public.temple_log enable row level security;

drop policy if exists temple_log_public_read on public.temple_log;
drop policy if exists public_read_on_temple_log on public.temple_log;
drop policy if exists public_select_on_temple_log on public.temple_log;
drop policy if exists "Enable public read for temple_log" on public.temple_log;
drop policy if exists "Public Read Logs" on public.temple_log;
drop policy if exists "Logs Public Access" on public.temple_log;

revoke all on public.temple_log from anon, authenticated;
revoke all on public.temple_log from public;

-- ---------------------------------------------------------------------------
-- 2. Chronicle signal is trigger-only and idempotent.
-- ---------------------------------------------------------------------------
create index if not exists temple_chronicle_signals_log_id_idx
  on public.temple_chronicle_signals (log_id);

create or replace function public.record_temple_chronicle_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id text;
begin
  v_log_id := coalesce(new.id::text, new.created_at::text, '');

  insert into public.temple_chronicle_signals (
    log_id,
    event_type,
    public_name,
    occurred_at
  )
  select
    v_log_id,
    coalesce(new.event_type, ''),
    case
      when new.is_public_identity is true
        and upper(coalesce(new.event_type, '')) not like 'ABSOLUTION%'
        then nullif(trim(new.author), '')
      else null
    end,
    coalesce(new.created_at, now())
  where not exists (
    select 1
    from public.temple_chronicle_signals existing
    where existing.log_id = v_log_id
  );

  return new;
end;
$$;

-- The trigger still fires under the table owner. Direct RPC calls by clients
-- are no longer possible.
revoke all on function public.record_temple_chronicle_signal() from public;
revoke all on function public.record_temple_chronicle_signal() from anon, authenticated;
grant execute on function public.record_temple_chronicle_signal() to service_role;

comment on function public.record_temple_chronicle_signal() is
  'Trigger-only Chronicle projection. SECURITY DEFINER, empty search_path, idempotent per temple_log id, not client-executable.';

-- ---------------------------------------------------------------------------
-- 3. vigils hearts: remove the five-heart cap, keep only safe public columns.
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_row record;
begin
  -- The original table was created outside the managed migrations with an
  -- inline `check (id >= 1 and id <= 5)`. Drop any check that still encodes the
  -- obsolete product cap; keep the primary key and other constraints.
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.vigil_hearts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%<= 5%'
  loop
    execute format(
      'alter table public.vigil_hearts drop constraint %I',
      constraint_row.conname
    );
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vigil_hearts'::regclass
      and conname = 'vigil_hearts_id_positive_check'
  ) then
    alter table public.vigil_hearts
      add constraint vigil_hearts_id_positive_check
      check (id >= 1) not valid;
  end if;
end
$$;

alter table public.vigil_hearts
  validate constraint vigil_hearts_id_positive_check;

revoke all on table public.vigil_hearts from public;
revoke select on table public.vigil_hearts from anon, authenticated;

grant select (
  id,
  owner_name,
  last_lit_at,
  is_locked,
  created_at,
  updated_at
) on table public.vigil_hearts to anon, authenticated;

-- Never broadcast the full row: owner_id and intention are private.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vigil_hearts'
  ) then
    alter publication supabase_realtime drop table public.vigil_hearts;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. The lifetime counter trigger is also trigger-only.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.record_vigil_spark_count()') is not null then
    revoke all on function public.record_vigil_spark_count() from public;
    revoke all on function public.record_vigil_spark_count() from anon, authenticated;
    grant execute on function public.record_vigil_spark_count() to service_role;
  end if;
end
$$;

commit;
