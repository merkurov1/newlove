-- Rollback: shared owner-level YouTube channel
-- Date: 2026-12-13
--
-- Removes the YouTube provider from the two check constraints and drops the
-- snapshot index. Existing YouTube connection/snapshot rows are preserved, so
-- this rollback is safe only after those rows are removed; otherwise the new
-- constraints reject them and PostgreSQL aborts the transaction.

DO $$
BEGIN
  DROP INDEX IF EXISTS public.analytics_snapshots_youtube_period_idx;

  ALTER TABLE public.analytics_connections
    DROP CONSTRAINT IF EXISTS analytics_connections_provider_check;
  ALTER TABLE public.analytics_connections
    ADD CONSTRAINT analytics_connections_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));

  ALTER TABLE public.analytics_snapshots
    DROP CONSTRAINT IF EXISTS analytics_snapshots_provider_check;
  ALTER TABLE public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky'));
END $$;
