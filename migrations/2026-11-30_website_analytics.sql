-- ─────────────────────────────────────────────────────────────────────────────
-- Pierrot Website Intelligence · external analytics data layer
--
-- Additive only. No existing table, view, function or grant is modified.
-- Stores:
--   * external source connections (server-side encrypted refresh tokens);
--   * idempotent daily metric rows and Search Console performance rows;
--   * raw report snapshots for audit;
--   * sync run history and a cooperative per-provider lock.
--
-- All objects are private to service_role. No anon/authenticated access.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.analytics_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_analytics', 'search_console', 'umami')),
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'error', 'needs_reauthorization', 'not_configured', 'disabled')),
  account_label text,
  external_id text,
  external_meta jsonb not null default '{}'::jsonb,
  scopes text[] not null default '{}',
  token_ciphertext text,
  token_iv text,
  token_tag text,
  token_key_version text,
  connected_by uuid,
  connected_at timestamptz,
  disabled_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

comment on table public.analytics_connections is
  'Pierrot website intelligence: external analytics connections. Refresh tokens are AES-256-GCM encrypted; plaintext is never stored.';
comment on column public.analytics_connections.external_id is
  'GA4 numeric property id, Search Console site URL, or Umami website id.';

create table if not exists public.analytics_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_analytics', 'search_console', 'umami')),
  mode text not null check (mode in ('manual', 'incremental', 'backfill', 'repair')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed', 'skipped')),
  range_start date,
  range_end date,
  timezone text not null default 'Europe/London',
  rows_written integer not null default 0,
  snapshot_rows integer not null default 0,
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists analytics_sync_runs_provider_started_idx
  on public.analytics_sync_runs (provider, started_at desc);

create table if not exists public.analytics_metrics_daily (
  provider text not null check (provider in ('google_analytics', 'umami')),
  report_type text not null,
  metric_date date not null,
  dimension_key text not null default 'total',
  dimension_value text not null default '',
  dimension_hash text not null default '',
  metric text not null,
  value numeric not null,
  unit text not null default 'count',
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create unique index if not exists analytics_metrics_daily_upsert_idx
  on public.analytics_metrics_daily
  (provider, report_type, metric_date, dimension_key, dimension_hash, metric);

create index if not exists analytics_metrics_daily_lookup_idx
  on public.analytics_metrics_daily (provider, report_type, metric_date);

comment on table public.analytics_metrics_daily is
  'Normalized external metrics. A row is a value of one metric for one source, day, report and dimension. Upserts are idempotent via dimension_hash.';

create table if not exists public.analytics_search_performance (
  metric_date date not null,
  site_url text not null,
  query text not null default '',
  page text not null default '',
  country text not null default '',
  device text not null default '',
  query_hash text not null default '',
  page_hash text not null default '',
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric,
  position numeric,
  data_state text not null default 'final',
  synced_at timestamptz not null default now()
);

create unique index if not exists analytics_search_performance_upsert_idx
  on public.analytics_search_performance
  (metric_date, site_url, query_hash, page_hash, country, device);

create index if not exists analytics_search_performance_date_idx
  on public.analytics_search_performance (site_url, metric_date);
create index if not exists analytics_search_performance_query_idx
  on public.analytics_search_performance (site_url, query_hash, metric_date);

comment on table public.analytics_search_performance is
  'Search Console rows at query × page × country × device × day granularity. CTR and position are stored exactly as returned by the API.';

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_analytics', 'search_console', 'umami')),
  report_type text not null,
  period_start date not null,
  period_end date not null,
  checksum text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (provider, report_type, period_start, period_end, checksum)
);

create index if not exists analytics_snapshots_period_idx
  on public.analytics_snapshots (provider, period_start desc, period_end desc);

create table if not exists public.analytics_sync_locks (
  provider text primary key check (provider in ('google_analytics', 'search_console', 'umami')),
  run_id uuid not null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.analytics_try_lock(
  p_provider text,
  p_run_id uuid,
  p_ttl_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.analytics_sync_locks as l (provider, run_id, locked_until)
  values (p_provider, p_run_id, now() + make_interval(secs => greatest(30, p_ttl_seconds)))
  on conflict (provider) do update
    set run_id = excluded.run_id,
        locked_until = excluded.locked_until,
        created_at = now()
    where l.locked_until < now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.analytics_unlock(p_provider text, p_run_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.analytics_sync_locks
  where provider = p_provider and run_id = p_run_id;
$$;

revoke all on function public.analytics_try_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.analytics_unlock(text, uuid) from public, anon, authenticated;
grant execute on function public.analytics_try_lock(text, uuid, integer) to service_role;
grant execute on function public.analytics_unlock(text, uuid) to service_role;

alter table public.analytics_connections enable row level security;
alter table public.analytics_sync_runs enable row level security;
alter table public.analytics_metrics_daily enable row level security;
alter table public.analytics_search_performance enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.analytics_sync_locks enable row level security;

revoke all on table public.analytics_connections from public, anon, authenticated;
revoke all on table public.analytics_sync_runs from public, anon, authenticated;
revoke all on table public.analytics_metrics_daily from public, anon, authenticated;
revoke all on table public.analytics_search_performance from public, anon, authenticated;
revoke all on table public.analytics_snapshots from public, anon, authenticated;
revoke all on table public.analytics_sync_locks from public, anon, authenticated;

grant select, insert, update, delete on table public.analytics_connections to service_role;
grant select, insert, update, delete on table public.analytics_sync_runs to service_role;
grant select, insert, update, delete on table public.analytics_metrics_daily to service_role;
grant select, insert, update, delete on table public.analytics_search_performance to service_role;
grant select, insert, update, delete on table public.analytics_snapshots to service_role;
grant select, insert, update, delete on table public.analytics_sync_locks to service_role;
