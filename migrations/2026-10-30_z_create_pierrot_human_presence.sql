-- Migration: PIERO HUMAN PRESENCE
-- Date: 2026-10-30
--
-- Adds human takeover requests/sessions on top of the existing Pierrot
-- conversation tables. Transcript content stays in public.pierrot_messages.
-- The new tables only hold request state, Telegram delivery metadata and a
-- SHA-256 hash of the visitor's recovery token.
--
-- State machine (stored):
--   pending -> active -> closed
--   pending -> declined
--   pending -> expired
--
-- "accepted" is an instantaneous transition: the accept RPC writes
-- accepted_at and creates the single active session in one transaction.
--
-- Security model:
--   * RLS is enabled and there are no anon/authenticated policies.
--   * anon/authenticated cannot read or write these tables directly.
--   * all access is server-mediated through the service role.
--   * visitor authorization uses the existing conversation/session pair or
--     an opaque 256-bit recovery token whose SHA-256 hash is stored here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Human requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_human_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'closed', 'declined', 'expired')),
  access_token_hash TEXT NOT NULL
    CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
  visitor_label TEXT NOT NULL
    CHECK (visitor_label ~ '^#[A-F0-9]{4}$'),
  start_page TEXT NOT NULL DEFAULT '/',
  context_summary TEXT
    CHECK (context_summary IS NULL OR char_length(context_summary) <= 280),
  language TEXT NOT NULL DEFAULT 'und'
    CHECK (language IN ('ru', 'en', 'und')),
  resolved_by TEXT
    CHECK (resolved_by IS NULL OR resolved_by IN ('owner', 'visitor', 'system')),
  telegram_chat_id BIGINT,
  telegram_message_id BIGINT,
  telegram_status_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pierrot_human_requests_conversation_idx
  ON public.pierrot_human_requests (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_human_requests_status_expiry_idx
  ON public.pierrot_human_requests (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_requests_one_pending_idx
  ON public.pierrot_human_requests (conversation_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_requests_one_active_idx
  ON public.pierrot_human_requests (conversation_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_requests_token_idx
  ON public.pierrot_human_requests (access_token_hash);

CREATE INDEX IF NOT EXISTS pierrot_human_requests_telegram_idx
  ON public.pierrot_human_requests (telegram_chat_id, telegram_message_id);

-- ---------------------------------------------------------------------------
-- 2. Active human sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_human_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE
    REFERENCES public.pierrot_human_requests(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  owner_telegram_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT
    CHECK (closed_by IS NULL OR closed_by IN ('owner', 'visitor', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_human_sessions_request_idx
  ON public.pierrot_human_sessions (request_id);

CREATE INDEX IF NOT EXISTS pierrot_human_sessions_conversation_idx
  ON public.pierrot_human_sessions (conversation_id, opened_at DESC);

-- A conversation can have at most one active human session.
CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_sessions_one_active_conversation_idx
  ON public.pierrot_human_sessions (conversation_id)
  WHERE status = 'active';

-- Anton can only be in one live conversation at a time. This makes plain
-- Telegram text routing unambiguous and prevents duplicate accepts.
CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_sessions_one_active_owner_idx
  ON public.pierrot_human_sessions (owner_telegram_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Message delivery metadata (content lives in pierrot_messages)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_human_message_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL
    REFERENCES public.pierrot_human_requests(id) ON DELETE CASCADE,
  session_id UUID NOT NULL
    REFERENCES public.pierrot_human_sessions(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE
    REFERENCES public.pierrot_messages(id) ON DELETE CASCADE,
  direction TEXT NOT NULL
    CHECK (direction IN ('visitor_to_telegram', 'telegram_to_visitor')),
  telegram_chat_id BIGINT,
  telegram_message_id BIGINT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'received', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_human_message_links_session_idx
  ON public.pierrot_human_message_links (session_id, created_at);

CREATE INDEX IF NOT EXISTS pierrot_human_message_links_conversation_idx
  ON public.pierrot_human_message_links (conversation_id, created_at);

-- Telegram message ids are unique per chat. The partial index is the final
-- idempotency guard for redelivered webhook updates.
CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_message_links_telegram_idx
  ON public.pierrot_human_message_links (telegram_chat_id, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Extend transcript roles with a distinct human-author role
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.pierrot_messages') IS NOT NULL THEN
    ALTER TABLE public.pierrot_messages
      DROP CONSTRAINT IF EXISTS pierrot_messages_role_check;

    ALTER TABLE public.pierrot_messages
      ADD CONSTRAINT pierrot_messages_role_check
      CHECK (role IN ('user', 'assistant', 'human'));
  END IF;
END $$;

-- Recreate the atomic message writer with the extended role contract.
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

  IF p_role NOT IN ('user', 'assistant', 'human') THEN
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

-- ---------------------------------------------------------------------------
-- 5. Extend the event contract with human-presence audit events
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.pierrot_events
  DROP CONSTRAINT IF EXISTS pierrot_events_event_name_check;

DO $$
BEGIN
  IF to_regclass('public.pierrot_events') IS NOT NULL THEN
    ALTER TABLE public.pierrot_events
      ADD CONSTRAINT pierrot_events_event_name_check
      CHECK (event_name IN (
        'conversation_started',
        'message_sent',
        'assistant_replied',
        'assistant_failed',
        'intent_classified',
        'offer_selected',
        'offer_viewed',
        'cta_shown',
        'navigation_proposed',
        'navigation_completed',
        'action_clicked',
        'offer_action_clicked',
        'subscribe_cta_clicked',
        'commercial_declined',
        'commercial_returned',
        'order_paid',
        'checkout_started',
        'service_inquiry_started',
        'service_need_selected',
        'service_inquiry_qualified',
        'service_contact_consent',
        'service_inquiry_submitted',
        'service_inquiry_received',
        'unframed_request_submitted',
        'unframed_purchase_confirmed',
        'conversation_ended',
        'human_requested',
        'human_request_duplicate',
        'human_accepted',
        'human_declined',
        'human_expired',
        'human_closed',
        'human_message_sent',
        'human_message_received',
        'human_notification_failed',
        'human_ai_blocked'
      )) NOT VALID;
  END IF;
END $$;

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
    'offer_selected',
    'offer_viewed',
    'cta_shown',
    'navigation_proposed',
    'navigation_completed',
    'action_clicked',
    'offer_action_clicked',
    'subscribe_cta_clicked',
    'commercial_declined',
    'commercial_returned',
    'order_paid',
    'checkout_started',
    'service_inquiry_started',
    'service_need_selected',
    'service_inquiry_qualified',
    'service_contact_consent',
    'service_inquiry_submitted',
    'service_inquiry_received',
    'unframed_request_submitted',
    'unframed_purchase_confirmed',
    'conversation_ended',
    'human_requested',
    'human_request_duplicate',
    'human_accepted',
    'human_declined',
    'human_expired',
    'human_closed',
    'human_message_sent',
    'human_message_received',
    'human_notification_failed',
    'human_ai_blocked'
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

-- ---------------------------------------------------------------------------
-- 6. Request lifecycle RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_human_request_create(
  p_conversation_id TEXT,
  p_session_id TEXT,
  p_access_token_hash TEXT,
  p_visitor_label TEXT,
  p_start_page TEXT,
  p_context_summary TEXT,
  p_language TEXT,
  p_ttl_seconds INTEGER DEFAULT 1200
)
RETURNS TABLE (
  request_id UUID,
  status TEXT,
  created BOOLEAN,
  expires_at TIMESTAMPTZ,
  visitor_label TEXT,
  created_at TIMESTAMPTZ,
  start_page TEXT,
  context_summary TEXT,
  language TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
  v_active public.pierrot_human_requests%ROWTYPE;
  v_expires TIMESTAMPTZ;
BEGIN
  IF p_conversation_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_session_id !~ '^[A-Za-z0-9_-]{8,64}$' THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;

  IF p_access_token_hash !~ '^[0-9a-f]{64}$'
     OR p_visitor_label !~ '^#[A-F0-9]{4}$'
     OR p_language NOT IN ('ru', 'en', 'und') THEN
    RAISE EXCEPTION 'invalid_request_metadata' USING ERRCODE = '22023';
  END IF;

  -- Serialise requests for one conversation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:conversation:' || p_conversation_id, 0)
  );

  PERFORM 1
  FROM public.pierrot_conversations
  WHERE id = p_conversation_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_active
  FROM public.pierrot_human_requests r
  WHERE r.conversation_id = p_conversation_id
    AND r.status = 'active'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_active.id, v_active.status, FALSE, v_active.expires_at,
      v_active.visitor_label, v_active.created_at, v_active.start_page,
      v_active.context_summary, v_active.language;
    RETURN;
  END IF;

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.conversation_id = p_conversation_id
    AND r.status = 'pending'
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.expires_at <= NOW() THEN
      UPDATE public.pierrot_human_requests
      SET status = 'expired',
          expired_at = NOW(),
          resolved_by = 'system',
          updated_at = NOW()
      WHERE id = v_request.id;
    ELSE
      -- Rotate the recovery token on an explicit retry. The browser that
      -- asked again receives a working token; older tokens stop working.
      UPDATE public.pierrot_human_requests
      SET access_token_hash = p_access_token_hash,
          updated_at = NOW()
      WHERE id = v_request.id
      RETURNING * INTO v_request;

      RETURN QUERY SELECT
        v_request.id, v_request.status, FALSE, v_request.expires_at,
        v_request.visitor_label, v_request.created_at, v_request.start_page,
        v_request.context_summary, v_request.language;
      RETURN;
    END IF;
  END IF;

  v_expires := NOW() + make_interval(
    secs => GREATEST(60, LEAST(COALESCE(p_ttl_seconds, 1200), 3600))
  );

  INSERT INTO public.pierrot_human_requests (
    conversation_id,
    status,
    access_token_hash,
    visitor_label,
    start_page,
    context_summary,
    language,
    expires_at
  )
  VALUES (
    p_conversation_id,
    'pending',
    p_access_token_hash,
    p_visitor_label,
    COALESCE(p_start_page, '/'),
    NULLIF(left(COALESCE(p_context_summary, ''), 280), ''),
    COALESCE(p_language, 'und'),
    v_expires
  )
  RETURNING * INTO v_request;

  RETURN QUERY SELECT
    v_request.id, v_request.status, TRUE, v_request.expires_at,
    v_request.visitor_label, v_request.created_at, v_request.start_page,
    v_request.context_summary, v_request.language;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_human_request_accept(
  p_request_id UUID,
  p_owner_telegram_id BIGINT
)
RETURNS TABLE (
  result TEXT,
  request_id UUID,
  conversation_id TEXT,
  session_id UUID,
  visitor_label TEXT,
  start_page TEXT,
  context_summary TEXT,
  request_created_at TIMESTAMPTZ,
  busy_conversation_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
  v_session public.pierrot_human_sessions%ROWTYPE;
  v_busy public.pierrot_human_sessions%ROWTYPE;
  v_conversation_id TEXT;
BEGIN
  IF p_request_id IS NULL OR p_owner_telegram_id IS NULL OR p_owner_telegram_id <= 0 THEN
    RAISE EXCEPTION 'invalid_accept_arguments' USING ERRCODE = '22023';
  END IF;

  -- One live conversation per owner. Different requests accepted at the same
  -- time serialise here; the second receives owner_busy.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:owner:' || p_owner_telegram_id::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:request:' || p_request_id::text, 0)
  );

  SELECT r.conversation_id
  INTO v_conversation_id
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_request_id, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  -- Serialise acceptance with AI/human message appends for this conversation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conversation_id, 0)
  );

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_request_id, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF v_request.status = 'active' THEN
    SELECT * INTO v_session
    FROM public.pierrot_human_sessions s
    WHERE s.request_id = p_request_id
    LIMIT 1;

    RETURN QUERY SELECT
      'already_active'::text, v_request.id, v_request.conversation_id,
      v_session.id, v_request.visitor_label, v_request.start_page,
      v_request.context_summary, v_request.created_at, NULL::text;
    RETURN;
  END IF;

  IF v_request.status IN ('closed', 'declined') THEN
    RETURN QUERY SELECT
      v_request.status::text, v_request.id, v_request.conversation_id,
      NULL::uuid, v_request.visitor_label, v_request.start_page,
      v_request.context_summary, v_request.created_at, NULL::text;
    RETURN;
  END IF;

  IF v_request.status = 'expired' OR v_request.expires_at <= NOW() THEN
    UPDATE public.pierrot_human_requests
    SET status = 'expired',
        expired_at = COALESCE(expired_at, NOW()),
        resolved_by = COALESCE(resolved_by, 'system'),
        updated_at = NOW()
    WHERE id = v_request.id;

    RETURN QUERY SELECT
      'expired'::text, v_request.id, v_request.conversation_id,
      NULL::uuid, v_request.visitor_label, v_request.start_page,
      v_request.context_summary, v_request.created_at, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_busy
  FROM public.pierrot_human_sessions s
  WHERE s.owner_telegram_id = p_owner_telegram_id
    AND s.status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      'owner_busy'::text, v_request.id, v_request.conversation_id,
      NULL::uuid, v_request.visitor_label, v_request.start_page,
      v_request.context_summary, v_request.created_at, v_busy.conversation_id;
    RETURN;
  END IF;

  SELECT * INTO v_session
  FROM public.pierrot_human_sessions s
  WHERE s.conversation_id = v_request.conversation_id
    AND s.status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      'already_active'::text, v_request.id, v_request.conversation_id,
      v_session.id, v_request.visitor_label, v_request.start_page,
      v_request.context_summary, v_request.created_at, NULL::text;
    RETURN;
  END IF;

  UPDATE public.pierrot_human_requests
  SET status = 'active',
      accepted_at = NOW(),
      telegram_chat_id = p_owner_telegram_id,
      updated_at = NOW()
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  INSERT INTO public.pierrot_human_sessions (
    request_id,
    conversation_id,
    owner_telegram_id,
    status,
    opened_at
  )
  VALUES (
    v_request.id,
    v_request.conversation_id,
    p_owner_telegram_id,
    'active',
    NOW()
  )
  RETURNING * INTO v_session;

  RETURN QUERY SELECT
    'accepted'::text, v_request.id, v_request.conversation_id,
    v_session.id, v_request.visitor_label, v_request.start_page,
    v_request.context_summary, v_request.created_at, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_human_request_decline(
  p_request_id UUID,
  p_resolved_by TEXT DEFAULT 'owner'
)
RETURNS TABLE (
  result TEXT,
  request_id UUID,
  conversation_id TEXT,
  visitor_label TEXT,
  telegram_chat_id BIGINT,
  telegram_message_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_resolved_by NOT IN ('owner', 'visitor', 'system') THEN
    RAISE EXCEPTION 'invalid_decline_arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:request:' || p_request_id::text, 0)
  );

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_request_id, NULL::text, NULL::text,
      NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  IF v_request.status = 'declined' THEN
    RETURN QUERY SELECT
      'already_declined'::text, v_request.id, v_request.conversation_id,
      v_request.visitor_label, v_request.telegram_chat_id,
      v_request.telegram_message_id;
    RETURN;
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN QUERY SELECT
      v_request.status::text, v_request.id, v_request.conversation_id,
      v_request.visitor_label, v_request.telegram_chat_id,
      v_request.telegram_message_id;
    RETURN;
  END IF;

  IF v_request.expires_at <= NOW() THEN
    UPDATE public.pierrot_human_requests
    SET status = 'expired',
        expired_at = NOW(),
        resolved_by = 'system',
        updated_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  ELSE
    UPDATE public.pierrot_human_requests
    SET status = 'declined',
        declined_at = NOW(),
        resolved_by = p_resolved_by,
        updated_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  END IF;

  RETURN QUERY SELECT
    v_request.status::text, v_request.id, v_request.conversation_id,
    v_request.visitor_label, v_request.telegram_chat_id,
    v_request.telegram_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_human_request_expire(
  p_request_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:request:' || p_request_id::text, 0)
  );

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_request.status = 'pending' AND v_request.expires_at <= NOW() THEN
    UPDATE public.pierrot_human_requests
    SET status = 'expired',
        expired_at = NOW(),
        resolved_by = 'system',
        updated_at = NOW()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  END IF;

  RETURN v_request.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_human_expire_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired INTEGER;
BEGIN
  UPDATE public.pierrot_human_requests
  SET status = 'expired',
      expired_at = NOW(),
      resolved_by = 'system',
      updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at <= NOW();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN v_expired;
END;
$$;

CREATE OR REPLACE FUNCTION public.pierrot_human_session_close(
  p_request_id UUID,
  p_closed_by TEXT DEFAULT 'owner',
  p_owner_telegram_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  result TEXT,
  request_id UUID,
  conversation_id TEXT,
  session_id UUID,
  visitor_label TEXT,
  telegram_chat_id BIGINT,
  telegram_message_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
  v_session public.pierrot_human_sessions%ROWTYPE;
  v_conversation_id TEXT;
BEGIN
  IF p_request_id IS NULL OR p_closed_by NOT IN ('owner', 'visitor', 'system') THEN
    RAISE EXCEPTION 'invalid_close_arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:request:' || p_request_id::text, 0)
  );

  SELECT r.conversation_id
  INTO v_conversation_id
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_request_id, NULL::text, NULL::uuid,
      NULL::text, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  -- Serialise closure with message appends so an AI/human answer cannot be
  -- committed after the closure notice.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conversation_id, 0)
  );

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::text, p_request_id, NULL::text, NULL::uuid,
      NULL::text, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  SELECT * INTO v_session
  FROM public.pierrot_human_sessions s
  WHERE s.request_id = p_request_id
  LIMIT 1;

  IF FOUND AND p_owner_telegram_id IS NOT NULL
     AND v_session.owner_telegram_id != p_owner_telegram_id THEN
    RETURN QUERY SELECT
      'forbidden'::text, v_request.id, v_request.conversation_id,
      v_session.id, v_request.visitor_label, v_request.telegram_chat_id,
      v_request.telegram_message_id;
    RETURN;
  END IF;

  IF v_request.status = 'closed' THEN
    RETURN QUERY SELECT
      'already_closed'::text, v_request.id, v_request.conversation_id,
      COALESCE(v_session.id, NULL::uuid), v_request.visitor_label,
      v_request.telegram_chat_id, v_request.telegram_message_id;
    RETURN;
  END IF;

  IF v_request.status != 'active' THEN
    RETURN QUERY SELECT
      v_request.status::text, v_request.id, v_request.conversation_id,
      COALESCE(v_session.id, NULL::uuid), v_request.visitor_label,
      v_request.telegram_chat_id, v_request.telegram_message_id;
    RETURN;
  END IF;

  UPDATE public.pierrot_human_sessions
  SET status = 'closed',
      closed_at = NOW(),
      closed_by = p_closed_by,
      updated_at = NOW()
  WHERE request_id = p_request_id
    AND status = 'active'
  RETURNING * INTO v_session;

  UPDATE public.pierrot_human_requests
  SET status = 'closed',
      closed_at = NOW(),
      resolved_by = p_closed_by,
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN QUERY SELECT
    'closed'::text, v_request.id, v_request.conversation_id,
    v_session.id, v_request.visitor_label, v_request.telegram_chat_id,
    v_request.telegram_message_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Human message writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_human_append_message(
  p_request_id UUID,
  p_message_id TEXT,
  p_role TEXT,
  p_content TEXT,
  p_direction TEXT,
  p_telegram_chat_id BIGINT DEFAULT NULL,
  p_telegram_message_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  sequence BIGINT,
  content TEXT,
  inserted BOOLEAN,
  conversation_id TEXT,
  session_id UUID,
  already_linked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pierrot_human_requests%ROWTYPE;
  v_session public.pierrot_human_sessions%ROWTYPE;
  v_conversation_id TEXT;
  v_sequence BIGINT;
  v_content TEXT;
  v_already BOOLEAN := FALSE;
BEGIN
  IF p_request_id IS NULL
     OR p_message_id !~ '^[A-Za-z0-9_-]{8,64}$'
     OR p_content IS NULL
     OR char_length(p_content) < 1
     OR char_length(p_content) > 4000 THEN
    RAISE EXCEPTION 'invalid_message_arguments' USING ERRCODE = '22023';
  END IF;

  IF p_direction NOT IN ('visitor_to_telegram', 'telegram_to_visitor') THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE = '22023';
  END IF;

  IF (p_direction = 'visitor_to_telegram' AND p_role != 'user')
     OR (p_direction = 'telegram_to_visitor' AND p_role != 'human') THEN
    RAISE EXCEPTION 'invalid_role_for_direction' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('human:request:' || p_request_id::text, 0)
  );

  SELECT r.conversation_id
  INTO v_conversation_id
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'human_session_not_active' USING ERRCODE = 'P0002';
  END IF;

  -- Lock order is conversation -> request row everywhere a request may be
  -- created or appended. This prevents a create/append deadlock while keeping
  -- per-conversation message ordering serialised.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_conversation_id, 0)
  );

  SELECT *
  INTO v_request
  FROM public.pierrot_human_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status != 'active' THEN
    RAISE EXCEPTION 'human_session_not_active' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
  FROM public.pierrot_human_sessions s
  WHERE s.request_id = p_request_id
    AND s.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'human_session_not_active' USING ERRCODE = 'P0002';
  END IF;

  SELECT m.message_index, m.content
  INTO v_sequence, v_content
  FROM public.pierrot_messages m
  WHERE m.id = p_message_id
    AND m.conversation_id = v_request.conversation_id;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.pierrot_human_message_links l
      WHERE l.message_id = p_message_id
    ) INTO v_already;

    RETURN QUERY SELECT
      v_sequence, v_content, FALSE, v_request.conversation_id,
      v_session.id, v_already;
    RETURN;
  END IF;

  UPDATE public.pierrot_conversations
  SET next_message_sequence = next_message_sequence + 1,
      last_message_at = NOW(),
      updated_at = NOW(),
      expires_at = NOW() + INTERVAL '90 days'
  WHERE id = v_request.conversation_id
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
    v_request.conversation_id,
    p_role,
    p_content,
    v_sequence,
    NULL
  );

  INSERT INTO public.pierrot_human_message_links (
    request_id,
    session_id,
    conversation_id,
    message_id,
    direction,
    telegram_chat_id,
    telegram_message_id,
    delivery_status
  )
  VALUES (
    v_request.id,
    v_session.id,
    v_request.conversation_id,
    p_message_id,
    p_direction,
    p_telegram_chat_id,
    p_telegram_message_id,
    CASE WHEN p_direction = 'telegram_to_visitor' THEN 'received' ELSE 'pending' END
  );

  RETURN QUERY SELECT
    v_sequence, p_content, TRUE, v_request.conversation_id,
    v_session.id, FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_human_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_human_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_human_message_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_human_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_human_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_human_message_links FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.pierrot_human_requests TO service_role;
GRANT ALL ON TABLE public.pierrot_human_sessions TO service_role;
GRANT ALL ON TABLE public.pierrot_human_message_links TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_append_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_append_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_request_create(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_request_create(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_request_accept(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_request_accept(UUID, BIGINT)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_request_decline(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_request_decline(UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_request_expire(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_request_expire(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_expire_due()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_expire_due()
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_session_close(UUID, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_session_close(UUID, TEXT, BIGINT)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_append_message(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_append_message(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) TO service_role;

COMMENT ON TABLE public.pierrot_human_requests IS
  'Private human-presence requests. Server-only access; stores only a SHA-256 recovery-token hash.';
COMMENT ON TABLE public.pierrot_human_sessions IS
  'One active human takeover session per conversation and per owner Telegram account.';
COMMENT ON TABLE public.pierrot_human_message_links IS
  'Telegram delivery metadata for human-mode messages; content lives in pierrot_messages.';
COMMENT ON FUNCTION public.pierrot_human_append_message(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) IS
  'Atomically appends a human-mode message and its Telegram delivery metadata after verifying the active session.';
