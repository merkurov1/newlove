-- Migration: Pierrot commercial intelligence for the 90-day experiment
-- Date: 2026-11-02
--
-- This migration is additive. It:
--   1. adds the dedicated `donation_completed` event to the existing contract;
--   2. registers the conservative `temple_tribute` offer policy;
--   3. creates read-only financial/attribution views over the existing tables.
--
-- It does not rename or remove any existing event, table, view or column.
-- Donations remain separate from product purchases.

-- ---------------------------------------------------------------------------
-- 1. Event contract
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
        'donation_completed',
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
    'donation_completed',
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

REVOKE ALL ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_record_event(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Offer policy for the donation
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.pierrot_offer_policies
  DROP CONSTRAINT IF EXISTS pierrot_offer_policies_offer_id_check;

DO $$
BEGIN
  IF to_regclass('public.pierrot_offer_policies') IS NOT NULL THEN
    ALTER TABLE public.pierrot_offer_policies
      ADD CONSTRAINT pierrot_offer_policies_offer_id_check
      CHECK (offer_id IN (
        'heart_angel_postcard',
        'journal_flow',
        'art_engine',
        'advising',
        'unframed',
        'temple_tribute'
      ));
  END IF;
END $$;

INSERT INTO public.pierrot_offer_policies (
  offer_id,
  enabled,
  priority,
  max_shows_per_conversation,
  cooldown_turns,
  cooldown_seconds,
  min_interest_score,
  requires_repeated_engagement,
  allow_proactive
)
VALUES
  ('temple_tribute', TRUE, 15, 1, 8, 600, 3, FALSE, TRUE)
ON CONFLICT (offer_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Read-only commercial views
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pierrot_v_donations
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.conversation_id,
  COALESCE(e.payload->>'offer_id', 'temple_tribute') AS offer_id,
  e.payload->>'provider_session_id' AS provider_session_id,
  CASE
    WHEN e.payload->>'amount_total' ~ '^[0-9]+$'
      THEN (e.payload->>'amount_total')::NUMERIC
    ELSE NULL
  END AS amount_total,
  lower(e.payload->>'currency') AS currency,
  e.payload->>'source' AS source,
  e.created_at
FROM public.pierrot_events e
WHERE e.event_name = 'donation_completed';

CREATE OR REPLACE VIEW public.pierrot_v_postcard_sales
WITH (security_invoker = true) AS
SELECT
  o.id AS order_id,
  'heart_angel_postcard'::TEXT AS offer_id,
  o.amount::NUMERIC AS amount_minor,
  'gbp'::TEXT AS currency,
  o.status,
  o."createdAt" AS occurred_at,
  o."updatedAt" AS status_updated_at
FROM public.postcard_orders o
WHERE o.status IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED')
  AND o.amount IS NOT NULL
  AND o.amount > 0;

CREATE OR REPLACE VIEW public.pierrot_v_tribute_donations
WITH (security_invoker = true) AS
SELECT
  t.stripe_session_id,
  'temple_tribute'::TEXT AS offer_id,
  t.amount_cents::NUMERIC AS amount_minor,
  lower(t.currency) AS currency,
  t.created_at AS occurred_at
FROM public.tributes t
WHERE t.status = 'succeeded'
  AND t.stripe_session_id IS NOT NULL
  AND t.amount_cents IS NOT NULL
  AND t.amount_cents > 0;

CREATE OR REPLACE VIEW public.pierrot_v_subscription_conversions
WITH (security_invoker = true) AS
WITH confirmations AS (
  SELECT
    se.id,
    se.subscriber_id,
    se.conversation_id,
    se.created_at AS confirmed_at,
    se.payload,
    ROW_NUMBER() OVER (
      PARTITION BY se.subscriber_id
      ORDER BY se.created_at ASC, se.id ASC
    ) AS confirmation_rank
  FROM public.subscription_events se
  WHERE se.event_name = 'subscription_confirmed'
)
SELECT
  c.id,
  c.subscriber_id,
  c.conversation_id,
  c.confirmed_at,
  (c.subscriber_id IS NOT NULL AND c.confirmation_rank = 1) AS is_first_confirmation,
  s."createdAt" AS subscriber_created_at,
  s."confirmedAt" AS subscriber_confirmed_at,
  s."isActive" AS subscriber_is_active
FROM confirmations c
LEFT JOIN public.subscribers s
  ON s.id = c.subscriber_id;

-- A single normalized commercial-event surface for owner reads. The raw
-- payload remains available; this view only lifts the fields needed for
-- financial reporting.
CREATE OR REPLACE VIEW public.pierrot_v_commercial_events
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.conversation_id,
  e.event_name,
  COALESCE(e.payload->>'offer_id', e.payload->>'product_id') AS offer_id,
  e.payload->>'order_id' AS order_id,
  e.payload->>'provider_session_id' AS provider_session_id,
  CASE
    WHEN e.payload->>'amount_total' ~ '^[0-9]+$'
      THEN (e.payload->>'amount_total')::NUMERIC
    ELSE NULL
  END AS amount_minor,
  lower(e.payload->>'currency') AS currency,
  e.payload->>'source' AS source,
  e.created_at
FROM public.pierrot_events e
WHERE e.event_name IN (
  'interest_detected',
  'offer_eligible',
  'offer_selected',
  'offer_shown',
  'offer_viewed',
  'cta_shown',
  'offer_action_clicked',
  'checkout_started',
  'purchase_completed',
  'donation_completed'
);

-- Extend the existing funnel view with the dedicated donation column. The
-- original columns are preserved.
CREATE OR REPLACE VIEW public.pierrot_v_offer_funnel
WITH (security_invoker = true) AS
WITH signals AS (
  SELECT
    COALESCE(product_id, offer_id) AS offer_id,
    event_name,
    conversation_id
  FROM public.pierrot_v_events
  WHERE event_name IN (
    'interest_detected',
    'offer_eligible',
    'offer_selected',
    'offer_shown',
    'offer_viewed',
    'offer_rejected',
    'cta_shown',
    'offer_action_clicked',
    'checkout_started',
    'donation_completed'
  )
  UNION ALL
  SELECT offer_id, 'purchase_completed', conversation_id
  FROM public.pierrot_v_purchases
  WHERE offer_id IS NOT NULL
)
SELECT
  offer_id,
  COUNT(*) FILTER (WHERE event_name = 'interest_detected')::BIGINT AS interest_detected,
  COUNT(*) FILTER (WHERE event_name = 'offer_eligible')::BIGINT AS offer_eligible,
  COUNT(*) FILTER (WHERE event_name = 'offer_selected')::BIGINT AS offer_selected,
  COUNT(*) FILTER (WHERE event_name = 'offer_shown')::BIGINT AS offer_shown,
  COUNT(*) FILTER (WHERE event_name = 'offer_viewed')::BIGINT AS offer_viewed,
  COUNT(*) FILTER (WHERE event_name = 'offer_rejected')::BIGINT AS offer_rejected,
  COUNT(*) FILTER (WHERE event_name = 'cta_shown')::BIGINT AS cta_shown,
  COUNT(*) FILTER (WHERE event_name = 'offer_action_clicked')::BIGINT AS offer_action_clicked,
  COUNT(*) FILTER (WHERE event_name = 'checkout_started')::BIGINT AS checkout_started,
  COUNT(*) FILTER (WHERE event_name = 'purchase_completed')::BIGINT AS purchase_completed,
  COUNT(DISTINCT conversation_id)::BIGINT AS conversation_count,
  COUNT(*) FILTER (WHERE event_name = 'donation_completed')::BIGINT AS donation_completed
FROM signals
WHERE offer_id IS NOT NULL
GROUP BY offer_id;

REVOKE ALL ON public.pierrot_v_donations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_postcard_sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_tribute_donations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_subscription_conversions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_commercial_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_offer_funnel FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.pierrot_v_donations TO service_role;
GRANT SELECT ON public.pierrot_v_postcard_sales TO service_role;
GRANT SELECT ON public.pierrot_v_tribute_donations TO service_role;
GRANT SELECT ON public.pierrot_v_subscription_conversions TO service_role;
GRANT SELECT ON public.pierrot_v_commercial_events TO service_role;
GRANT SELECT ON public.pierrot_v_offer_funnel TO service_role;

COMMENT ON VIEW public.pierrot_v_donations IS
  'Pierrot-attributed Temple donations; separate from product purchases.';
COMMENT ON VIEW public.pierrot_v_postcard_sales IS
  'All paid postcard orders from the authoritative order table; no email or address exposed.';
COMMENT ON VIEW public.pierrot_v_tribute_donations IS
  'All succeeded Temple Tributes from the authoritative tribute table; no donor identity exposed.';
COMMENT ON VIEW public.pierrot_v_subscription_conversions IS
  'Confirmed Flow subscriptions with first-confirmation status; no email exposed.';

COMMENT ON COLUMN public.pierrot_v_offer_funnel.donation_completed IS
  'Confirmed donations; never added to purchase_completed.';
