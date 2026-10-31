-- Migration: fix ambiguous request_id in pierrot_human_session_close
-- Date: 2026-10-31
--
-- The function returns an OUT column named `request_id`. Its UPDATE statement
-- compared the unqualified table column `request_id` with the parameter, so
-- PostgreSQL raised "column reference request_id is ambiguous" exactly when a
-- live session was being closed. That broke /end, visitor close and the
-- automatic replacement of a stale active session.
--
-- This migration only qualifies the column with a table alias. The signature,
-- return columns and authorization checks are unchanged.

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

  UPDATE public.pierrot_human_sessions AS s
  SET status = 'closed',
      closed_at = NOW(),
      closed_by = p_closed_by,
      updated_at = NOW()
  WHERE s.request_id = p_request_id
    AND s.status = 'active'
  RETURNING * INTO v_session;

  UPDATE public.pierrot_human_requests AS r
  SET status = 'closed',
      closed_at = NOW(),
      resolved_by = p_closed_by,
      updated_at = NOW()
  WHERE r.id = p_request_id
  RETURNING * INTO v_request;

  RETURN QUERY SELECT
    'closed'::text, v_request.id, v_request.conversation_id,
    v_session.id, v_request.visitor_label, v_request.telegram_chat_id,
    v_request.telegram_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pierrot_human_session_close(UUID, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_human_session_close(UUID, TEXT, BIGINT)
  TO service_role;
