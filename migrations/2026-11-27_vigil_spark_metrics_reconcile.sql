-- Vigil lifetime metrics reconciliation (forward migration).
--
-- Production 2026-11-27 has no public.vigil_spark_stats table and no
-- public.vigil_spark_metrics view, while the reviewed source file
-- migrations/2026-11-26_vigil_lifetime_metrics.sql was never recorded in
-- supabase_migrations.schema_migrations. This file is the managed, idempotent
-- forward migration for those genuinely missing objects.
--
-- It is safe to run before or after the historical source file: every
-- statement is idempotent and no row is deleted or rewritten. Metrics describe
-- stable identity keys, never display names, and identity_key stays private.

begin;

alter table if exists public.vigil_spark_claims
  add column if not exists spark_count integer not null default 0,
  add column if not exists first_spark_at timestamptz;

update public.vigil_spark_claims
set spark_count = 1,
    first_spark_at = last_spark_at
where spark_count = 0
  and last_spark_at > 'epoch'::timestamptz;

create table if not exists public.vigil_spark_stats (
  id integer primary key check (id = 1),
  lifetime_total bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.vigil_spark_stats (id, lifetime_total)
select
  1,
  count(*)::bigint
from public.temple_log
where trim(
  both '_' from regexp_replace(
    upper(coalesce(event_type, '')),
    '[^A-Z0-9]+',
    '_',
    'g'
  )
) in ('VIGIL', 'VIGIL_SPARK')
on conflict (id) do nothing;

alter table public.vigil_spark_stats enable row level security;
revoke all on public.vigil_spark_stats from public, anon, authenticated;
grant all on public.vigil_spark_stats to service_role;

create or replace function public.record_vigil_spark_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_spark_at is not null
     and (old.last_spark_at is null or new.last_spark_at > old.last_spark_at)
     and (
       old.last_spark_at is null
       or old.last_spark_at <= 'epoch'::timestamptz
       or new.last_spark_at >= old.last_spark_at + interval '24 hours'
     ) then
    new.spark_count := coalesce(old.spark_count, 0) + 1;
    new.first_spark_at := coalesce(old.first_spark_at, new.last_spark_at);

    update public.vigil_spark_stats
    set lifetime_total = lifetime_total + 1,
        updated_at = now()
    where id = 1;
  end if;

  return new;
end;
$$;

revoke all on function public.record_vigil_spark_count() from public;
revoke all on function public.record_vigil_spark_count() from anon, authenticated;
grant execute on function public.record_vigil_spark_count() to service_role;

drop trigger if exists vigil_spark_claims_count on public.vigil_spark_claims;
create trigger vigil_spark_claims_count
  before update of last_spark_at on public.vigil_spark_claims
  for each row
  execute function public.record_vigil_spark_count();

create or replace view public.vigil_spark_metrics as
select
  (select lifetime_total from public.vigil_spark_stats where id = 1)
    as lifetime_total,
  (select count(*)::bigint from public.vigil_spark_claims where spark_count > 0)
    as unique_participants,
  (select count(*)::bigint from public.vigil_spark_claims where spark_count > 1)
    as returning_participants,
  (
    select count(*)::bigint
    from public.vigil_spark_claims
    where spark_count > 0
      and identity_key like 'tg:%'
  ) as telegram_participants,
  (
    select count(*)::bigint
    from public.vigil_spark_claims
    where spark_count > 0
      and identity_key like 'sb:%'
  ) as supabase_participants,
  (select min(created_at) from public.vigil_spark_claims where spark_count > 0)
    as reliable_since;

comment on view public.vigil_spark_metrics is
  'Aggregate-only Vigil metrics for /api/vigil/state. Never returns identity keys, names or per-person rows.';

revoke all on public.vigil_spark_metrics from public, anon, authenticated;
grant select on public.vigil_spark_metrics to service_role;

commit;
