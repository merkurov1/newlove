-- Migration: Pierrot identity attribution (owner / visitor / unknown)
-- Date: 2026-11-12
--
-- Apply manually through the project's existing Supabase migration workflow.
-- This migration is additive and non-destructive. It does not backfill
-- historical identity: every existing conversation remains `unknown` unless a
-- server-verified authentication record can prove ownership at creation time.
--
-- Privacy:
--   * visitor_id is a random first-party pseudonym, never an IP, email or
--     fingerprint;
--   * no new personal data is stored;
--   * RLS and existing grants are unchanged.

ALTER TABLE IF EXISTS public.pierrot_conversations
  ADD COLUMN IF NOT EXISTS identity_type TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_source TEXT;

DO $$
BEGIN
  IF to_regclass('public.pierrot_conversations') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pierrot_conversations_identity_type_check'
  ) THEN
    ALTER TABLE public.pierrot_conversations
      ADD CONSTRAINT pierrot_conversations_identity_type_check
      CHECK (identity_type IN ('owner', 'visitor', 'unknown'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pierrot_conversations_visitor_id_check'
  ) THEN
    ALTER TABLE public.pierrot_conversations
      ADD CONSTRAINT pierrot_conversations_visitor_id_check
      CHECK (visitor_id IS NULL OR visitor_id ~ '^[A-Za-z0-9_-]{8,64}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pierrot_conversations_identity_source_check'
  ) THEN
    ALTER TABLE public.pierrot_conversations
      ADD CONSTRAINT pierrot_conversations_identity_source_check
      CHECK (
        identity_source IS NULL
        OR identity_source IN (
          'supabase_session',
          'bearer_jwt',
          'telegram_init_data',
          'telegram_owner',
          'visitor_local_storage',
          'anonymous'
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pierrot_conversations_identity_consistency_check'
  ) THEN
    ALTER TABLE public.pierrot_conversations
      ADD CONSTRAINT pierrot_conversations_identity_consistency_check
      CHECK (
        identity_type IN ('owner', 'visitor', 'unknown')
        AND (
          (identity_type = 'owner' AND identity_verified_at IS NOT NULL)
          OR (identity_type = 'visitor' AND visitor_id IS NOT NULL AND identity_verified_at IS NULL)
          OR (identity_type = 'unknown' AND visitor_id IS NULL)
        )
      )
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pierrot_conversations_identity_idx
  ON public.pierrot_conversations (identity_type, started_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_conversations_visitor_idx
  ON public.pierrot_conversations (visitor_id, started_at DESC)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pierrot_conversations_user_identity_idx
  ON public.pierrot_conversations (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.pierrot_conversations.identity_type IS
  'Server-verified attribution: owner, visitor or unknown. Never inferred from /admin, IP or client input.';
COMMENT ON COLUMN public.pierrot_conversations.visitor_id IS
  'Random first-party visitor pseudonym, stored only after explicit consent.';
COMMENT ON COLUMN public.pierrot_conversations.identity_source IS
  'Mechanism that established identity: Supabase session, JWT, Telegram owner, visitor storage or anonymous.';
COMMENT ON COLUMN public.pierrot_conversations.identity_verified_at IS
  'Set only when a trusted server credential established owner identity.';

-- Historical rows are intentionally not guessed. They keep identity_type =
-- 'unknown'. To prove an owner after the fact one would need a trusted
-- authentication record tied to the conversation at creation time; no such
-- record is present for the existing data.
