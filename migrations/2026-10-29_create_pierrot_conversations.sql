-- Migration: server-side Pierrot Intelligence conversations, messages and events
-- Date: 2026-10-29
-- Apply with the project's existing migrations workflow (see README / docs/MIGRATION-GUIDE.md).
--
-- Privacy model:
--   * RLS is enabled and no anon/authenticated policies exist.
--   * anon/authenticated cannot read or write these tables directly.
--   * the server route uses SUPABASE_SERVICE_ROLE_KEY and therefore bypasses RLS.
--   * conversations expire after 90 days; purge_expired_pierrot_conversations() can be
--     scheduled by an operator (pg_cron or a protected maintenance job).
--
-- Do not expose these tables through a public GET endpoint.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pierrot_conversations (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  session_id TEXT NOT NULL
    CHECK (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'expired')),
  consent_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (consent_state IN ('pending', 'granted', 'denied')),
  consent_version TEXT,
  language TEXT NOT NULL DEFAULT 'und'
    CHECK (language IN ('ru', 'en', 'und')),
  start_page TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  next_message_sequence BIGINT NOT NULL DEFAULT 0
    CHECK (next_message_sequence >= 0)
);

CREATE INDEX IF NOT EXISTS pierrot_conversations_session_idx
  ON public.pierrot_conversations (session_id);

CREATE INDEX IF NOT EXISTS pierrot_conversations_started_at_idx
  ON public.pierrot_conversations (started_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_conversations_expires_at_idx
  ON public.pierrot_conversations (expires_at);

CREATE TABLE IF NOT EXISTS public.pierrot_messages (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^[A-Za-z0-9_-]{8,64}$'),
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL
    CHECK (char_length(content) BETWEEN 1 AND 4000),
  message_index BIGINT NOT NULL
    CHECK (message_index > 0),
  provider TEXT
    CHECK (provider IS NULL OR provider IN ('gemini', 'deepseek', 'openrouter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, message_index)
);

CREATE INDEX IF NOT EXISTS pierrot_messages_conversation_idx
  ON public.pierrot_messages (conversation_id, message_index);

CREATE TABLE IF NOT EXISTS public.pierrot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL
    CHECK (event_name IN (
      'conversation_started',
      'message_sent',
      'assistant_replied',
      'assistant_failed',
      'intent_classified',
      'offer_viewed',
      'cta_shown',
      'navigation_proposed',
      'navigation_completed',
      'action_clicked',
      'offer_action_clicked',
      'commercial_declined',
      'commercial_returned',
      'conversation_ended'
    )),
  event_key TEXT NOT NULL
    CHECK (event_key ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 4096),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, event_key)
);

CREATE INDEX IF NOT EXISTS pierrot_events_conversation_idx
  ON public.pierrot_events (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS pierrot_events_name_idx
  ON public.pierrot_events (event_name, created_at DESC);

-- Atomic per-conversation ordering and idempotent message writes.
-- p_session_id prevents a caller that only knows a conversation id from
-- appending to somebody else's transcript.
CREATE OR REPLACE FUNCTION public.pierrot_append_message(
  p_conversation_id TEXT,
  p_session_id TEXT,
  p_message_id TEXT,
  p_role TEXT,
  p_content TEXT,
  p_provider TEXT DEFAULT NULL
)
RETURNS TABLE (sequence BIGINT, content TEXT, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence BIGINT;
  v_content TEXT;
BEGIN
  IF p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_session_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_message_id !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('user', 'assistant') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR char_length(p_content) < 1 OR char_length(p_content) > 4000 THEN
    RAISE EXCEPTION 'invalid_content_length' USING ERRCODE = '22001';
  END IF;

  IF p_provider IS NOT NULL AND p_provider NOT IN ('gemini', 'deepseek', 'openrouter') THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id, 0));

  PERFORM 1
  FROM public.pierrot_conversations
  WHERE id = p_conversation_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- A retry of the same client message must return the original row, not
  -- append a duplicate or consume another sequence number.
  SELECT m.message_index, m.content
  INTO v_sequence, v_content
  FROM public.pierrot_messages m
  WHERE m.id = p_message_id
    AND m.conversation_id = p_conversation_id;

  IF FOUND THEN
    RETURN QUERY SELECT v_sequence, v_content, FALSE;
    RETURN;
  END IF;

  UPDATE public.pierrot_conversations
  SET next_message_sequence = next_message_sequence + 1,
      last_message_at = NOW(),
      updated_at = NOW(),
      expires_at = NOW() + INTERVAL '90 days'
  WHERE id = p_conversation_id AND session_id = p_session_id
  RETURNING next_message_sequence INTO v_sequence;

  INSERT INTO public.pierrot_messages (
    id,
    conversation_id,
    role,
    content,
    message_index,
    provider
  )
  VALUES (
    p_message_id,
    p_conversation_id,
    p_role,
    p_content,
    v_sequence,
    p_provider
  );

  RETURN QUERY SELECT v_sequence, p_content, TRUE;
END;
$$;

-- Idempotent event write with the same session check.
CREATE OR REPLACE FUNCTION public.pierrot_record_event(
  p_conversation_id TEXT,
  p_session_id TEXT,
  p_event_name TEXT,
  p_event_key TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  IF p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_session_id !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;

  IF p_event_name NOT IN (
    'conversation_started',
    'message_sent',
    'assistant_replied',
    'assistant_failed',
    'intent_classified',
    'offer_viewed',
    'cta_shown',
    'navigation_proposed',
    'navigation_completed',
    'action_clicked',
    'offer_action_clicked',
    'commercial_declined',
    'commercial_returned',
    'conversation_ended'
  ) THEN
    RAISE EXCEPTION 'invalid_event_name' USING ERRCODE = '22023';
  END IF;

  IF p_event_key IS NULL OR p_event_key !~ '^[A-Za-z0-9_.:-]{1,160}$' THEN
    RAISE EXCEPTION 'invalid_event_key' USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 4096 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.pierrot_conversations
  WHERE id = p_conversation_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pierrot_events (
    conversation_id,
    event_name,
    event_key,
    payload
  )
  VALUES (
    p_conversation_id,
    p_event_name,
    p_event_key,
    p_payload
  )
  ON CONFLICT (conversation_id, event_key) DO NOTHING;

  v_inserted := FOUND;

  RETURN v_inserted;
END;
$$;

-- Retention helper. Delete cascades to messages and events.
CREATE OR REPLACE FUNCTION public.purge_expired_pierrot_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.pierrot_conversations
  WHERE expires_at < NOW();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- RLS: closed by default. There are intentionally no anon/authenticated policies.
ALTER TABLE public.pierrot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_events FROM PUBLIC, anon, authenticated;

-- Server-side service role is the only direct database consumer.
GRANT ALL ON TABLE public.pierrot_conversations TO service_role;
GRANT ALL ON TABLE public.pierrot_messages TO service_role;
GRANT ALL ON TABLE public.pierrot_events TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_append_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_pierrot_conversations()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pierrot_append_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_pierrot_conversations()
  TO service_role;

COMMENT ON TABLE public.pierrot_conversations IS
  'Private Pierrot conversations. Server-only access; 90-day retention.';
COMMENT ON TABLE public.pierrot_messages IS
  'Idempotent Pierrot transcript messages ordered by per-conversation message_index.';
COMMENT ON TABLE public.pierrot_events IS
  'Minimal behaviour events for Pierrot; unique per conversation and event_key.';
COMMENT ON COLUMN public.pierrot_conversations.consent_state IS
  'pending/granted/denied. Transcript rows are only written by the API when consent is granted.';
COMMENT ON COLUMN public.pierrot_conversations.referrer IS
  'Sanitized http(s) referrer origin+path only; query strings and hashes are discarded.';

-- Example operator commands (do not run as part of an anonymous request):
--   SELECT public.purge_expired_pierrot_conversations();
--   SELECT cron.schedule('pierrot-retention', '0 4 * * *',
--     $$SELECT public.purge_expired_pierrot_conversations()$$);
