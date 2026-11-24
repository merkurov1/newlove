-- Read-only audit: Temple log semantics, event distribution and aggregate
-- correctness. Run against a staging/replica database first; this file contains
-- no INSERT/UPDATE/DELETE and must never be applied as a migration.
--
-- Definitions used below:
--   ritual        completed ritual signal (VIGIL, VIGIL_SPARK, ASH, CAST,
--                 ABSOLUTION, TRIBUTE, MEDITATION, SILENCE, HEARTANDANGEL,
--                 WHISPER and documented legacy spellings)
--   incomplete    MODAL_OPEN / INTENSITY, not proof that a ritual completed
--   infrastructure ENTER / NAV / PAGE_VIEW / VISIT / VIEW
--   unclassified  any other legacy type; preserve it, do not count it as ritual

with normalized as (
  select
    id,
    author,
    event_type,
    created_at,
    trim(
      both '_' from upper(
        regexp_replace(
          replace(trim(coalesce(event_type, '')), '&', ' AND '),
          '[^A-Za-z0-9]+',
          '_',
          'g'
        )
      )
    ) as normalized_type
  from public.temple_log
),
classified as (
  select
    id,
    author,
    event_type,
    created_at,
    normalized_type,
    case
      when normalized_type in ('LETITGO', 'LETGO', 'LET_GO', 'LET_IT_GO', 'LETTING_GO') then 'ASH'
      when normalized_type = 'VIGILSPARK' then 'VIGIL_SPARK'
      when normalized_type in ('HEART_AND_ANGEL', 'HEART_ANGEL') then 'HEARTANDANGEL'
      when normalized_type in ('PAGEVIEW', 'NAVIGATION') then 'NAV'
      when normalized_type = 'ENTERED' then 'ENTER'
      when normalized_type = 'CALM' then 'MEDITATION'
      when normalized_type = 'MODALOPEN' then 'MODAL_OPEN'
      else normalized_type
    end as canonical_type
  from normalized
),
typed as (
  select
    *,
    case
      when canonical_type in (
        'VIGIL', 'VIGIL_SPARK', 'ASH', 'CAST', 'ABSOLUTION', 'TRIBUTE',
        'MEDITATION', 'SILENCE', 'HEARTANDANGEL', 'WHISPER'
      ) then 'ritual'
      when canonical_type in ('MODAL_OPEN', 'INTENSITY') then 'incomplete'
      when canonical_type in ('ENTER', 'NAV', 'PAGE_VIEW', 'VISIT', 'VIEW')
        then 'infrastructure'
      else 'unclassified'
    end as category
  from classified
)
select
  category,
  canonical_type,
  count(*) as row_count,
  min(created_at) as first_seen,
  max(created_at) as last_seen,
  count(distinct lower(trim(coalesce(author, '')))) as distinct_author_labels
from typed
group by category, canonical_type
order by category, row_count desc, canonical_type;

-- Legacy case/spelling variants for the same canonical event.
with normalized as (
  select
    event_type,
    trim(
      both '_' from upper(
        regexp_replace(
          replace(trim(coalesce(event_type, '')), '&', ' AND '),
          '[^A-Za-z0-9]+',
          '_',
          'g'
        )
      )
    ) as normalized_type
  from public.temple_log
)
select
  normalized_type,
  count(*) as row_count,
  count(distinct event_type) as raw_variant_count,
  array_agg(distinct event_type order by event_type) as raw_event_types
from normalized
group by normalized_type
having count(distinct event_type) > 1
order by raw_variant_count desc, normalized_type;

-- Full rolling 30-day window (inclusive UTC boundaries) used by Chronicles.
with normalized as (
  select
    id,
    author,
    created_at,
    trim(
      both '_' from upper(
        regexp_replace(
          replace(trim(coalesce(event_type, '')), '&', ' AND '),
          '[^A-Za-z0-9]+',
          '_',
          'g'
        )
      )
    ) as normalized_type
  from public.temple_log
  where created_at >= now() - interval '30 days'
    and created_at <= now()
),
classified as (
  select
    id,
    author,
    created_at,
    case
      when normalized_type in ('LETITGO', 'LETGO', 'LET_GO', 'LET_IT_GO', 'LETTING_GO') then 'ASH'
      when normalized_type = 'VIGILSPARK' then 'VIGIL_SPARK'
      when normalized_type in ('HEART_AND_ANGEL', 'HEART_ANGEL') then 'HEARTANDANGEL'
      when normalized_type in ('PAGEVIEW', 'NAVIGATION') then 'NAV'
      when normalized_type = 'ENTERED' then 'ENTER'
      when normalized_type = 'CALM' then 'MEDITATION'
      when normalized_type = 'MODALOPEN' then 'MODAL_OPEN'
      else normalized_type
    end as canonical_type
  from normalized
),
summary as (
  select
    *,
    canonical_type in (
      'VIGIL', 'VIGIL_SPARK', 'ASH', 'CAST', 'ABSOLUTION', 'TRIBUTE',
      'MEDITATION', 'SILENCE', 'HEARTANDANGEL', 'WHISPER'
    ) as is_ritual,
    canonical_type in ('VIGIL', 'VIGIL_SPARK') as is_vigil
  from classified
)
select
  count(*) filter (where is_ritual) as completed_rituals,
  count(distinct lower(trim(author))) filter (
    where is_ritual
      and trim(coalesce(author, '')) <> ''
      and lower(trim(author)) not in ('anonymous', 'guest', 'n/a', 'none', 'pilgrim', 'temple', 'unknown')
  ) as named_author_labels,
  count(*) filter (where is_vigil) as vigil_sparks,
  count(*) filter (
    where canonical_type in ('ENTER', 'NAV', 'PAGE_VIEW', 'VISIT', 'VIEW')
  ) as infrastructure_rows,
  count(*) filter (where canonical_type in ('MODAL_OPEN', 'INTENSITY'))
    as incomplete_rows,
  count(*) filter (
    where canonical_type not in (
      'VIGIL', 'VIGIL_SPARK', 'ASH', 'CAST', 'ABSOLUTION', 'TRIBUTE',
      'MEDITATION', 'SILENCE', 'HEARTANDANGEL', 'WHISPER',
      'ENTER', 'NAV', 'PAGE_VIEW', 'VISIT', 'VIEW',
      'MODAL_OPEN', 'INTENSITY'
    )
  ) as unclassified_rows
from summary;

-- Boundary check: the same row at the exact start/end must be included once.
with bounds as (
  select
    now() - interval '30 days' as window_start,
    now() as window_end
)
select
  count(*) filter (where created_at = bounds.window_start) as at_start,
  count(*) filter (where created_at = bounds.window_end) as at_end,
  count(*) filter (where created_at < bounds.window_start) as before_window,
  count(*) filter (where created_at > bounds.window_end) as after_window
from public.temple_log
cross join bounds;
