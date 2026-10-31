-- Migration: restore the complete Pierrot event contract and human activity
-- Date: 2026-10-31
--
-- Why this exists:
--   * 2026-10-30_repair_pierrot_event_constraint.sql and the later
--     2026-10-30_z_create_pierrot_human_presence.sql both recreated the event
--     function with a partial list. In production that silently dropped
--     `brain_retrieval` and several commercial events, so retrieval traces
--     were rejected by the database.
--   * Accepted human sessions had no activity timestamp. An abandoned
--     Telegram session therefore stayed "active" forever and received plain
--     text replies intended for a newer visitor.
--
-- This migration is additive: it recreates two functions and adds one index.
-- It does not delete or rewrite existing rows.

-- ---------------------------------------------------------------------------
-- 1. Complete event-name contract
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
        'brain_retrieval',
        'answer_corrected',
        'interest_detected',
        'offer_eligible',
        'offer_selected',
        'offer_viewed',
        'offer_shown',
        'cta_shown',
        'navigation_proposed',
        'navigation_completed',
        'action_clicked',
        'offer_action_clicked',
        'answer_feedback',
        'subscribe_cta_clicked',
        'commercial_declined',
        'commercial_returned',
        'order_paid',
        'purchase_completed',
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
    'brain_retrieval',
    'answer_corrected',
    'interest_detected',
    'offer_eligible',
    'offer_selected',
    'offer_viewed',
    'offer_shown',
    'cta_shown',
    'navigation_proposed',
    'navigation_completed',
    'action_clicked',
    'offer_action_clicked',
    'answer_feedback',
    'subscribe_cta_clicked',
    'commercial_declined',
    'commercial_returned',
    'order_paid',
    'purchase_completed',
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
-- 2. Human activity timestamp
-- ---------------------------------------------------------------------------

-- Supports the unambiguous "single pending request for this owner" fallback.
CREATE INDEX IF NOT EXISTS pierrot_human_requests_owner_pending_idx
  ON public.pierrot_human_requests (telegram_chat_id, created_at DESC)
  WHERE status = 'pending';

-- Same contract as 2026-10-30_z_create_pierrot_human_presence.sql, plus an
-- activity refresh used by lazy idle-session expiry.
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

  -- Activity heartbeat for lazy idle-session expiry.
  UPDATE public.pierrot_human_requests
  SET updated_at = NOW()
  WHERE id = v_request.id;

  UPDATE public.pierrot_human_sessions
  SET updated_at = NOW()
  WHERE id = v_session.id;

  RETURN QUERY SELECT
    v_sequence, p_content, TRUE, v_request.conversation_id,
    v_session.id, FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants (unchanged, kept explicit)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.pierrot_human_append_message(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_append_message(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT
) TO service_role;
