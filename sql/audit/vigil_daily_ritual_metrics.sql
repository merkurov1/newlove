-- Read-only Vigil daily-ritual audit.
--
-- Run against a staging replica or the read-only SQL console. This file has no
-- INSERT/UPDATE/DELETE and must never be applied as a migration.
--
-- Definitions:
--   spark      one successful VIGIL / VIGIL_SPARK event
--   identity   stable private key `tg:<telegram id>` or `sb:<supabase uuid>`
--   returning  identity with more than one successful spark; the 24h server
--              cooldown makes each success a different 24h window
--
-- identity is not a person: two accounts are two identities. Historical rows
-- before 2026-11-16 have no stable identity and are not reconstructed.

with normalized_sparks as (
  select
    id,
    created_at,
    trim(
      both '_' from regexp_replace(
        upper(coalesce(event_type, '')),
        '[^A-Z0-9]+',
        '_',
        'g'
      )
    ) as normalized_type
  from public.temple_log
  where trim(
    both '_' from regexp_replace(
      upper(coalesce(event_type, '')),
      '[^A-Z0-9]+',
      '_',
      'g'
    )
  ) in ('VIGIL', 'VIGIL_SPARK')
),
spark_totals as (
  select
    coalesce(
      (select lifetime_total from public.vigil_spark_stats where id = 1),
      0
    ) as lifetime_total,
    min(created_at) as first_spark_at,
    max(created_at) as latest_spark_at
  from normalized_sparks
),
identity_totals as (
  select
    count(*) filter (where spark_count > 0) as unique_participants,
    count(*) filter (where spark_count > 1) as returning_participants,
    count(*) filter (
      where spark_count > 0 and identity_key like 'tg:%'
    ) as telegram_participants,
    count(*) filter (
      where spark_count > 0 and identity_key like 'sb:%'
    ) as supabase_participants,
    min(created_at) filter (where spark_count > 0) as identity_tracking_since
  from public.vigil_spark_claims
),
rolling_window as (
  select
    count(*) as supporters_24h
  from public.vigil_spark_claims
  where last_spark_at > now() - interval '24 hours'
)
select
  spark_totals.lifetime_total,
  rolling_window.supporters_24h,
  identity_totals.unique_participants,
  identity_totals.returning_participants,
  case
    when identity_totals.unique_participants > 0
      then round(
        identity_totals.returning_participants::numeric
        / identity_totals.unique_participants,
        4
      )
    else null
  end as repeat_rate,
  identity_totals.telegram_participants,
  identity_totals.supabase_participants,
  identity_totals.identity_tracking_since,
  spark_totals.first_spark_at,
  spark_totals.latest_spark_at
from spark_totals
cross join identity_totals
cross join rolling_window;

-- Per-identity sanity: distribution of successful sparks without exposing
-- identity keys. Counts are coarse buckets, never a list of people.
select
  case
    when spark_count <= 0 then '0 (placeholder)'
    when spark_count = 1 then '1'
    when spark_count between 2 and 5 then '2-5'
    when spark_count between 6 and 20 then '6-20'
    else '21+'
  end as spark_bucket,
  count(*) as identity_count
from public.vigil_spark_claims
group by spark_bucket
order by spark_bucket;
