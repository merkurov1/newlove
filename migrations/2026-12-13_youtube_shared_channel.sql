-- Migration: shared owner-level YouTube channel for Pierrot + UNFRAMED
-- Date: 2026-12-13
--
-- STATUS: PREPARED ONLY. Additive only. No existing table or token is
-- rewritten, and no YouTube metrics table is created: reports are read on
-- demand and cached as provenance snapshots.
--
-- One row in analytics_connections (provider = 'youtube') is the single channel
-- connection shared by both projects. Refresh tokens remain encrypted; project
-- records never receive a token. analytics_snapshots stores raw report payloads
-- with fetched_at implied by created_at and a checksum for audit.
--
-- Rollback: migrations/rollback/2026-12-13_youtube_shared_channel_rollback.sql

DO $$
BEGIN
  ALTER TABLE public.analytics_connections
    DROP CONSTRAINT IF EXISTS analytics_connections_provider_check;
  ALTER TABLE public.analytics_connections
    ADD CONSTRAINT analytics_connections_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky', 'youtube'));

  ALTER TABLE public.analytics_snapshots
    DROP CONSTRAINT IF EXISTS analytics_snapshots_provider_check;
  ALTER TABLE public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_provider_check
    CHECK (provider IN ('google_analytics', 'search_console', 'umami', 'bluesky', 'youtube'));
END $$;

CREATE INDEX IF NOT EXISTS analytics_snapshots_youtube_period_idx
  ON public.analytics_snapshots (period_start DESC, period_end DESC, created_at DESC)
  WHERE provider = 'youtube';

COMMENT ON COLUMN public.analytics_connections.external_id IS
  'GA4 numeric property id, Search Console site URL, Umami website id, or the shared YouTube channel id. YouTube has exactly one owner-level row.';

COMMENT ON COLUMN public.analytics_connections.external_meta IS
  'Provider provenance. For YouTube: channel_title, uploads_playlist_id, project_slugs (pierrot + unframed), API names and last_checked_at. Never contains tokens.';
