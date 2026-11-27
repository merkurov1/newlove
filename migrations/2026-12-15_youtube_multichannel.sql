-- Migration: multi-account / multi-channel YouTube integration
-- Date: 2026-12-15
--
-- STATUS: PREPARED ONLY. Additive only. Does not rewrite
-- analytics_connections, its analytics history, or any existing snapshot.
--
-- Why separate tables:
--   One Google OAuth grant can expose several channels (including Brand
--   Accounts). One YouTube channel can be used by several projects. The legacy
--   analytics_connections row (provider = 'youtube') remains untouched and is
--   still readable as a fallback for the historical single shared channel.
--
-- Security:
--   Refresh tokens are stored only in youtube_oauth_connections, AES-GCM
--   sealed with the same server-only key as the existing analytics grants.
--   youtube_channels, youtube_project_bindings and the audit log never contain
--   tokens. RLS is enabled and anon/authenticated access is revoked.
--
-- owner_id is the Supabase auth user UUID in production (migration version
-- 20261126140616). Code passes `user.id` through unchanged. This prepared
-- definition matches that production shape so a fresh environment does not
-- drift; it is NOT re-applied to production.
--
-- Rollback: migrations/rollback/2026-12-15_youtube_multichannel_rollback.sql

CREATE TABLE IF NOT EXISTS public.youtube_oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  google_account_id text,
  google_account_email text NOT NULL,
  google_account_name text,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reauthorization', 'error', 'revoked')),
  scopes text[] NOT NULL DEFAULT '{}',
  -- Sealed refresh token only. Never returned by any API route.
  token_ciphertext text,
  token_iv text,
  token_tag text,
  token_key_version text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_error_code text,
  last_error_message text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, google_account_email)
);

CREATE TABLE IF NOT EXISTS public.youtube_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL
    REFERENCES public.youtube_oauth_connections(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  channel_id text NOT NULL,
  title text,
  handle text,
  uploads_playlist_id text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unavailable', 'disconnected')),
  hidden_subscriber_count boolean NOT NULL DEFAULT false,
  subscriber_count bigint,
  view_count bigint,
  video_count bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, channel_id),
  UNIQUE (owner_id, channel_id)
);

CREATE INDEX IF NOT EXISTS youtube_channels_owner_idx
  ON public.youtube_channels (owner_id, status);

CREATE TABLE IF NOT EXISTS public.youtube_project_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  project_slug text NOT NULL,
  channel_record_id uuid NOT NULL
    REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active channel per project per owner. The same channel can be active in
-- several projects (for example @unframed-tv for UNFRAMED and Pierrot).
CREATE UNIQUE INDEX IF NOT EXISTS youtube_project_bindings_active_project_idx
  ON public.youtube_project_bindings (owner_id, project_slug)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS youtube_project_bindings_channel_idx
  ON public.youtube_project_bindings (owner_id, channel_record_id);

ALTER TABLE public.youtube_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_project_bindings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.youtube_oauth_connections FROM anon, authenticated;
REVOKE ALL ON public.youtube_channels FROM anon, authenticated;
REVOKE ALL ON public.youtube_project_bindings FROM anon, authenticated;

COMMENT ON TABLE public.youtube_oauth_connections IS
  'Server-only Google OAuth grants for YouTube. Contains sealed refresh tokens; never exposed to clients.';
COMMENT ON TABLE public.youtube_channels IS
  'Channels exposed by one OAuth grant, including Brand Accounts and multiple channels per Google account.';
COMMENT ON TABLE public.youtube_project_bindings IS
  'Active project -> channel binding. One channel may be active in several projects; one active channel per project.';

-- Audit enrichment: record which editable fields changed and a short,
-- non-sensitive result. Descriptions, comment text and tokens are still never
-- written to the audit log.
--
-- CREATE IF NOT EXISTS keeps this migration self-contained when the earlier
-- 2026-12-14 management migration has not been applied yet. When the table
-- already exists this is a no-op and only the two columns are added.
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
  error_code text,
  changed_fields text[],
  result_summary text
);

ALTER TABLE public.youtube_management_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_management_audit FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS youtube_management_audit_created_idx
  ON public.youtube_management_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS youtube_management_audit_project_idx
  ON public.youtube_management_audit (project, created_at DESC);

ALTER TABLE public.youtube_management_audit
  ADD COLUMN IF NOT EXISTS changed_fields text[],
  ADD COLUMN IF NOT EXISTS result_summary text;

COMMENT ON COLUMN public.youtube_management_audit.changed_fields IS
  'Names of fields explicitly changed by an owner action (for example title, description, tags). Never their values.';
COMMENT ON COLUMN public.youtube_management_audit.result_summary IS
  'Short non-sensitive outcome, for example "updated 2 fields" or "no change".';
