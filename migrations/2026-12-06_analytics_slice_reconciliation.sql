-- Migration: exact-slice reconciliation for website analytics
-- Date: 2026-12-06
--
-- STATUS: PREPARED ONLY. Additive functions; no existing table is rewritten.
--
-- Sync used to be upsert-only. A provider recalculation that removed a
-- dimension left the old row forever. These functions replace one exact
-- provider/report/date slice inside a single transaction, while preserving
-- every row outside that slice.
--
-- Rollback: migrations/rollback/2026-12-06_analytics_slice_reconciliation_rollback.sql

create or replace function public.analytics_replace_metric_slice(
  p_provider text,
  p_report_types text[],
  p_from date,
  p_to date,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer := 0;
begin
  if p_provider not in ('google_analytics', 'umami', 'bluesky') then
    raise exception 'invalid_analytics_provider' using errcode = '22023';
  end if;
  if p_report_types is null or cardinality(p_report_types) = 0 then
    raise exception 'report_types_required' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array' using errcode = '22023';
  end if;

  delete from public.analytics_metrics_daily
  where provider = p_provider
    and report_type = any(p_report_types)
    and metric_date between p_from and p_to;

  insert into public.analytics_metrics_daily (
    provider,
    report_type,
    metric_date,
    dimension_key,
    dimension_value,
    dimension_hash,
    metric,
    value,
    unit,
    metadata,
    synced_at
  )
  select
    p_provider,
    x.report_type,
    x.metric_date,
    coalesce(x.dimension_key, 'total'),
    left(coalesce(x.dimension_value, ''), 2048),
    coalesce(x.dimension_hash, ''),
    x.metric,
    x.value,
    coalesce(x.unit, 'count'),
    coalesce(x.metadata, '{}'::jsonb),
    now()
  from jsonb_to_recordset(p_rows) as x(
    report_type text,
    metric_date date,
    dimension_key text,
    dimension_value text,
    dimension_hash text,
    metric text,
    value numeric,
    unit text,
    metadata jsonb
  );

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.analytics_replace_search_slice(
  p_site_url text,
  p_from date,
  p_to date,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer := 0;
begin
  if p_site_url is null or btrim(p_site_url) = '' then
    raise exception 'site_url_required' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array' using errcode = '22023';
  end if;

  delete from public.analytics_search_performance
  where site_url = p_site_url
    and metric_date between p_from and p_to;

  insert into public.analytics_search_performance (
    metric_date,
    site_url,
    query,
    page,
    country,
    device,
    query_hash,
    page_hash,
    clicks,
    impressions,
    ctr,
    position,
    data_state,
    synced_at
  )
  select
    x.metric_date,
    p_site_url,
    left(coalesce(x.query, ''), 1024),
    left(coalesce(x.page, ''), 2048),
    coalesce(x.country, ''),
    coalesce(x.device, ''),
    coalesce(x.query_hash, ''),
    coalesce(x.page_hash, ''),
    coalesce(x.clicks, 0),
    coalesce(x.impressions, 0),
    x.ctr,
    x.position,
    coalesce(x.data_state, 'final'),
    now()
  from jsonb_to_recordset(p_rows) as x(
    metric_date date,
    query text,
    page text,
    country text,
    device text,
    query_hash text,
    page_hash text,
    clicks integer,
    impressions integer,
    ctr numeric,
    position numeric,
    data_state text
  );

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.analytics_replace_metric_slice(text, text[], date, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.analytics_replace_search_slice(text, date, date, jsonb)
  from public, anon, authenticated;

grant execute on function public.analytics_replace_metric_slice(text, text[], date, date, jsonb)
  to service_role;
grant execute on function public.analytics_replace_search_slice(text, date, date, jsonb)
  to service_role;

comment on function public.analytics_replace_metric_slice(text, text[], date, date, jsonb)
  is 'Atomically replaces one provider/report/date metric slice. Rows outside the slice are preserved.';
comment on function public.analytics_replace_search_slice(text, date, date, jsonb)
  is 'Atomically replaces one Search Console site/date slice. Rows outside the slice are preserved.';
