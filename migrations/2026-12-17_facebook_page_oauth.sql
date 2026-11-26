-- Migration: Flow · encrypted Facebook Page OAuth connection
-- Date: 2026-12-17
--
-- STATUS: PREPARED ONLY. Additive only. No existing connection, token or
-- metric row is rewritten.
--
-- The admin OAuth flow stores exactly one Facebook Page connection in
-- analytics_connections (provider = 'facebook'). token_ciphertext contains the
-- AES-256-GCM sealed Page access token; the long-lived User token used to
-- obtain it is never persisted. external_meta keeps only Page provenance
-- (page id/name, granted permissions, obtained_at) and never a token.
--
-- This migration sorts after the YouTube provider constraints so it extends
-- the latest accepted provider list instead of being overwritten by them.

DO $$
BEGIN
  ALTER TABLE public.analytics_connections
    DROP CONSTRAINT IF EXISTS analytics_connections_provider_check;
  ALTER TABLE public.analytics_connections
    ADD CONSTRAINT analytics_connections_provider_check
    CHECK (provider IN (
      'google_analytics',
      'search_console',
      'umami',
      'bluesky',
      'youtube',
      'facebook'
    ));
END $$;

COMMENT ON COLUMN public.analytics_connections.token_ciphertext IS
  'AES-256-GCM sealed credential. For provider=facebook this is the long-lived Page access token; the User token is never stored.';
