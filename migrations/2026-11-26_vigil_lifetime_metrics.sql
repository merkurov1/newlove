-- Vigil lifetime and returning-participant metrics.
--
-- Additive only. This migration does not rewrite, delete or backfill any
-- `temple_log` row and does not touch the shared 24h flame or cooldown rules.
--
-- Why this is needed
-- ------------------
-- `vigil_spark_claims` stores only the latest spark per identity, so the
-- previous schema could answer "how many identities sparked in the last 24h"
-- but not "how many sparks ever" or "who came back". We add:
--
--   * `spark_count` / `first_spark_at` per stable identity, incremented by a
--     trigger only when the claim UPDATE advances `last_spark_at` through the
--     same 24h conditional update that already serialises concurrent claims;
--   * a private aggregate view for the public state route.
--
-- Existing claim rows are backfilled with their last known successful spark
-- (one event). Earlier history is not reconstructed from display names or
-- `temple_log` authors. The lifetime counter is seeded once from all-time
-- VIGIL / VIGIL_SPARK log rows and then advanced by the claim trigger, so it
-- never resets and keeps legacy history without double counting new sparks.
--
-- Metrics are identities, not verified people: `tg:` and `sb:` namespaces are
-- never merged by name or email. See docs/VIGIL_DAILY_RITUAL.md.

begin;

alter table if exists public.vigil_spark_claims
  add column if not exists spark_count integer not null default 0,
  add column if not exists first_spark_at timestamptz;

comment on column public.vigil_spark_claims.spark_count is
  'Successful sparks recorded for this stable identity since claim tracking began. Incremented by trigger only when the 24h window actually advances.';

comment on column public.vigil_spark_claims.first_spark_at is
  'First known successful spark for this identity, or NULL before the first success.';

-- Existing rows represent one known successful spark. We intentionally do not
-- invent a first timestamp older than the stored last spark.
update public.vigil_spark_claims
set spark_count = 1,
    first_spark_at = last_spark_at
where spark_count = 0
  and last_spark_at > 'epoch'::timestamptz;

-- All-time counter seeded from the existing log, then advanced atomically with
-- every successful claim. Keeping it in its own singleton row means a rare
-- temple_log write failure cannot make a committed spark disappear from the
-- counter.
create table if not exists public.vigil_spark_stats (
  id integer primary key check (id = 1),
  lifetime_total bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.vigil_spark_stats is
  'Private single-row Vigil lifetime counter. Seeded from historical VIGIL/VIGIL_SPARK rows and advanced by the claim trigger.';

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
set search_path = public
as $$
begin
  -- The claim endpoint serialises updates through this row. Only an update
  -- that moves the window forward by at least the cooldown is a new spark.
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

drop trigger if exists vigil_spark_claims_count on public.vigil_spark_claims;
create trigger vigil_spark_claims_count
  before update of last_spark_at on public.vigil_spark_claims
  for each row
  execute function public.record_vigil_spark_count();

-- One row of aggregate-only public metrics. The view is private: the browser
-- gets the numbers through the allowlisted /api/vigil/state route, never
-- through anon/authenticated reads of the claim table.
create or replace view public.vigil_spark_metrics as
select
  (
    select lifetime_total
    from public.vigil_spark_stats
    where id = 1
  ) as lifetime_total,
  (
    select count(*)::bigint
    from public.vigil_spark_claims
    where spark_count > 0
  ) as unique_participants,
  (
    select count(*)::bigint
    from public.vigil_spark_claims
    where spark_count > 1
  ) as returning_participants,
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
  (
    select min(created_at)
    from public.vigil_spark_claims
    where spark_count > 0
  ) as reliable_since;

comment on view public.vigil_spark_metrics is
  'Aggregate-only Vigil metrics for /api/vigil/state. Never returns identity keys, names or per-person rows.';

revoke all on public.vigil_spark_metrics from public, anon, authenticated;
grant select on public.vigil_spark_metrics to service_role;

commit;
