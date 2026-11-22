-- Migration: YouTube channel management audit log
-- Date: 2026-12-14
--
-- STATUS: PREPARED ONLY. Additive only. Does not rewrite the existing
-- analytics refresh token or any YouTube analytics history.
--
-- The shared channel connection continues to live in
-- analytics_connections (provider = 'youtube'). A management grant may belong
-- to a different Google account (e.g. UNFRAMED), so its encrypted refresh
-- token is stored in separate columns. The analytics credential remains
-- untouched and keeps working. The audit table records operation outcomes
-- (who, which project, which action, target id, status) and never stores
-- descriptions, comment text, caption files, upload bytes or tokens.
--
-- Rollback: see migrations/rollback/2026-12-14_youtube_management_rollback.sql

ALTER TABLE public.analytics_connections
  ADD COLUMN IF NOT EXISTS management_token_ciphertext text,
  ADD COLUMN IF NOT EXISTS management_token_iv text,
  ADD COLUMN IF NOT EXISTS management_token_tag text,
  ADD COLUMN IF NOT EXISTS management_token_key_version text;

COMMENT ON COLUMN public.analytics_connections.management_token_ciphertext IS
  'AES-GCM sealed refresh token for the incremental YouTube management grant. Separate from token_ciphertext so selecting a different Google account cannot break analytics. Never exposed to clients.';

CREATE TABLE IF NOT EXISTS public.youtube_management_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL,
  project text NOT NULL,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'failed', 'confirmation_required', 'scope_missing')),
  channel_id text,
  target_id text,
  destructive boolean NOT NULL DEFAULT false,
  external boolean NOT NULL DEFAULT false,
  error_code text
);

ALTER TABLE public.youtube_management_audit ENABLE ROW LEVEL SECURITY;

-- No policies: service-role access only. The table is intentionally not
-- readable through anon/authenticated Supabase clients.
REVOKE ALL ON public.youtube_management_audit FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS youtube_management_audit_created_idx
  ON public.youtube_management_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS youtube_management_audit_project_idx
  ON public.youtube_management_audit (project, created_at DESC);

COMMENT ON TABLE public.youtube_management_audit IS
  'Append-only YouTube management operation outcomes. Contains identifiers only; never tokens, upload bytes, private descriptions or comment text.';
