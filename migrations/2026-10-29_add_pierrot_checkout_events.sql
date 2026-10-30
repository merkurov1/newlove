-- Migration: planner and checkout initiation events for Pierrot
-- Date: 2026-10-29
-- Apply after 2026-10-29_extend_pierrot_service_events.sql.
--
-- `offer_selected` is written by the deterministic planner before any prose or
-- CTA is rendered. `checkout_started` is written only by the existing postcard
-- and UNFRAMED checkout endpoints after Stripe creates a session. Neither event
-- proves a sale; `order_paid` and `unframed_purchase_confirmed` remain the
-- trusted confirmations.

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
        'conversation_ended'
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

REVOKE ALL ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.pierrot_events IS
  'Minimal behaviour, intent and commercial events for Pierrot; unique per conversation and event_key.';
