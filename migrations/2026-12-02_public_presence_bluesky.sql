-- Migration: Public Presence Intelligence · Bluesky source
-- Date: 2026-12-02
--
-- Extends the existing external analytics tables with a Bluesky provider.
-- No new metrics table is created: Bluesky profile/post observations use the
-- same normalized analytics_metrics_daily rows and the same sync-run/lock
-- lifecycle as GA4, Search Console and Umami.
--
-- Additive and reversible: the rollback removes the provider from the checks
-- only; existing Bluesky rows are preserved (they become invisible to the
-- constraints after rollback, so rollback should only be used for code that no
-- longer writes Bluesky data).

DO $$
BEGIN
  ALTER TABLE public.analytics_connections
    DROP CONSTRAINT IF EXISTS analytics_connections_provider_check;
  ALTER TABLE public.analytics_connections
    ADD CONSTRAINT analytics_connections_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));

  ALTER TABLE public.analytics_sync_runs
    DROP CONSTRAINT IF EXISTS analytics_sync_runs_provider_check;
  ALTER TABLE public.analytics_sync_runs
    ADD CONSTRAINT analytics_sync_runs_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));

  ALTER TABLE public.analytics_metrics_daily
    DROP CONSTRAINT IF EXISTS analytics_metrics_daily_provider_check;
  ALTER TABLE public.analytics_metrics_daily
    ADD CONSTRAINT analytics_metrics_daily_provider_check
    CHECK (provider IN ('google_analytics', 'umami', 'bluesky'));

  ALTER TABLE public.analytics_snapshots
    DROP CONSTRAINT IF EXISTS analytics_snapshots_provider_check;
  ALTER TABLE public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));

  ALTER TABLE public.analytics_sync_locks
    DROP CONSTRAINT IF EXISTS analytics_sync_locks_provider_check;
  ALTER TABLE public.analytics_sync_locks
    ADD CONSTRAINT analytics_sync_locks_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));
END $$;

CREATE INDEX IF NOT EXISTS analytics_metrics_daily_bluesky_post_idx
  ON public.analytics_metrics_daily (metric_date, dimension_value)
  WHERE provider = 'bluesky' AND report_type = 'post';

COMMENT ON COLUMN public.analytics_metrics_daily.metadata IS
  'Provider-specific provenance. For Bluesky post rows: text, post_created_at, url, site_links, outbound_links, engagement.';
