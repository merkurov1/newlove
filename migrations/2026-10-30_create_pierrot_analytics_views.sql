-- Migration: Pierrot analytics data layer
-- Date: 2026-10-30
--
-- Adds normalized, read-only views over pierrot_events, conversations,
-- messages, subscriptions, leads and confirmed purchases. Raw events are not
-- rewritten and existing event consumers keep working.
--
-- Privacy: views join session_id for owner-side aggregation, but no IP address
-- or visitor identifier is stored. Session counts are explicitly not visitor
-- counts. All views are service-role only.

CREATE INDEX IF NOT EXISTS pierrot_events_offer_id_idx
  ON public.pierrot_events ((payload->>'offer_id'));

CREATE INDEX IF NOT EXISTS pierrot_events_product_id_idx
  ON public.pierrot_events ((payload->>'product_id'));

CREATE INDEX IF NOT EXISTS pierrot_events_intent_idx
  ON public.pierrot_events ((payload->>'intent'));

CREATE OR REPLACE VIEW public.pierrot_v_events
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.conversation_id,
  c.session_id,
  e.event_name AS source_event_name,
  CASE e.event_name
    WHEN 'message_sent' THEN 'message_received'
    WHEN 'assistant_replied' THEN 'response_generated'
    WHEN 'navigation_proposed' THEN 'navigation_suggested'
    WHEN 'commercial_declined' THEN 'offer_rejected'
    WHEN 'brain_retrieval' THEN 'retrieval_performed'
    ELSE e.event_name
  END AS event_name,
  e.event_key,
  e.created_at,
  COALESCE(e.payload->>'route', e.payload->>'source_page', c.start_page) AS route,
  e.payload->>'source_page' AS source_page,
  COALESCE(e.payload->>'language', c.language) AS language,
  e.payload->>'intent' AS intent,
  e.payload->>'product_id' AS product_id,
  e.payload->>'offer_id' AS offer_id,
  e.payload->>'document_id' AS document_id,
  e.payload->>'recommendation_reason' AS recommendation_reason,
  e.payload->'metadata' AS metadata,
  e.payload,
  (
    e.event_name = 'brain_retrieval'
    AND (
      COALESCE(e.payload->>'outcome', '') <> 'relevant_results'
      OR e.payload->>'code' IS NOT NULL
    )
  ) AS retrieval_failed,
  (
    e.event_name = 'intent_classified'
    AND lower(COALESCE(e.payload->>'uncertain', 'false')) = 'true'
  ) AS intent_uncertain
FROM public.pierrot_events e
JOIN public.pierrot_conversations c ON c.id = e.conversation_id;

CREATE OR REPLACE VIEW public.pierrot_v_intent_changes
WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT
    conversation_id,
    created_at,
    intent,
    LAG(intent) OVER (PARTITION BY conversation_id ORDER BY created_at, event_key) AS previous_intent
  FROM public.pierrot_v_events
  WHERE event_name = 'intent_classified'
    AND intent IS NOT NULL
)
SELECT conversation_id, previous_intent, intent, created_at
FROM ordered
WHERE previous_intent IS NOT NULL
  AND previous_intent <> intent;

CREATE OR REPLACE VIEW public.pierrot_v_purchases
WITH (security_invoker = true) AS
WITH confirmed AS (
  SELECT
    e.conversation_id,
    COALESCE(e.payload->>'product_id', e.payload->>'offer_id') AS offer_id,
    e.payload->>'order_id' AS order_id,
    e.payload->>'provider_session_id' AS provider_session_id,
    CASE
      WHEN e.payload->>'amount_total' ~ '^-?[0-9]+$'
        THEN (e.payload->>'amount_total')::NUMERIC
      ELSE NULL
    END AS amount_total,
    e.payload->>'currency' AS currency,
    'purchase_completed'::TEXT AS source_event,
    e.created_at
  FROM public.pierrot_events e
  WHERE e.event_name = 'purchase_completed'
),
legacy_postcard AS (
  SELECT
    e.conversation_id,
    'heart_angel_postcard'::TEXT AS offer_id,
    e.payload->>'order_id' AS order_id,
    NULL::TEXT AS provider_session_id,
    CASE
      WHEN e.payload->>'amount_total' ~ '^-?[0-9]+$'
        THEN (e.payload->>'amount_total')::NUMERIC
      ELSE NULL
    END AS amount_total,
    e.payload->>'currency' AS currency,
    'order_paid'::TEXT AS source_event,
    e.created_at
  FROM public.pierrot_events e
  WHERE e.event_name = 'order_paid'
    AND NOT EXISTS (
      SELECT 1
      FROM confirmed c
      WHERE c.conversation_id = e.conversation_id
        AND c.order_id IS NOT NULL
        AND c.order_id = e.payload->>'order_id'
    )
),
legacy_unframed AS (
  SELECT
    e.conversation_id,
    'unframed'::TEXT AS offer_id,
    NULL::TEXT AS order_id,
    split_part(e.event_key, ':', 2) AS provider_session_id,
    CASE
      WHEN e.payload->>'amount_total' ~ '^-?[0-9]+$'
        THEN (e.payload->>'amount_total')::NUMERIC
      ELSE NULL
    END AS amount_total,
    e.payload->>'currency' AS currency,
    'unframed_purchase_confirmed'::TEXT AS source_event,
    e.created_at
  FROM public.pierrot_events e
  WHERE e.event_name = 'unframed_purchase_confirmed'
    AND NOT EXISTS (
      SELECT 1
      FROM confirmed c
      WHERE c.conversation_id = e.conversation_id
        AND c.provider_session_id IS NOT NULL
        AND c.provider_session_id = split_part(e.event_key, ':', 2)
    )
)
SELECT * FROM confirmed
UNION ALL
SELECT * FROM legacy_postcard
UNION ALL
SELECT * FROM legacy_unframed;

CREATE OR REPLACE VIEW public.pierrot_v_message_counts
WITH (security_invoker = true) AS
SELECT
  m.conversation_id,
  COUNT(*)::BIGINT AS message_count,
  COUNT(*) FILTER (WHERE m.role = 'user')::BIGINT AS user_message_count,
  COUNT(*) FILTER (WHERE m.role = 'assistant')::BIGINT AS assistant_message_count,
  MIN(m.created_at) AS first_message_at,
  MAX(m.created_at) AS last_message_at,
  (ARRAY_AGG(m.role ORDER BY m.message_index DESC))[1] AS last_message_role
FROM public.pierrot_messages m
GROUP BY m.conversation_id;

CREATE OR REPLACE VIEW public.pierrot_v_conversation_overview
WITH (security_invoker = true) AS
WITH events AS (
  SELECT
    conversation_id,
    COUNT(*)::BIGINT AS event_count,
    COUNT(*) FILTER (WHERE source_event_name = 'assistant_failed')::BIGINT AS assistant_failure_count,
    COUNT(*) FILTER (WHERE retrieval_failed)::BIGINT AS retrieval_failure_count,
    COUNT(DISTINCT COALESCE(product_id, offer_id))
      FILTER (WHERE COALESCE(product_id, offer_id) IS NOT NULL)::BIGINT AS offer_count
  FROM public.pierrot_v_events
  GROUP BY conversation_id
),
purchases AS (
  SELECT conversation_id, COUNT(*)::BIGINT AS purchase_count
  FROM public.pierrot_v_purchases
  GROUP BY conversation_id
)
SELECT
  c.id AS conversation_id,
  c.session_id,
  c.status,
  c.language,
  c.start_page,
  c.started_at,
  c.ended_at,
  c.last_message_at,
  c.updated_at,
  GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      COALESCE(c.ended_at, c.last_message_at, c.updated_at, c.started_at) - c.started_at
    ))::BIGINT
  ) AS duration_seconds,
  COALESCE(m.message_count, 0) AS message_count,
  COALESCE(m.user_message_count, 0) AS user_message_count,
  COALESCE(m.assistant_message_count, 0) AS assistant_message_count,
  m.last_message_role,
  COALESCE(e.event_count, 0) AS event_count,
  COALESCE(e.assistant_failure_count, 0) AS assistant_failure_count,
  COALESCE(e.retrieval_failure_count, 0) AS retrieval_failure_count,
  COALESCE(e.offer_count, 0) AS offer_count,
  COALESCE(p.purchase_count, 0) AS purchase_count
FROM public.pierrot_conversations c
LEFT JOIN public.pierrot_v_message_counts m ON m.conversation_id = c.id
LEFT JOIN events e ON e.conversation_id = c.id
LEFT JOIN purchases p ON p.conversation_id = c.id;

CREATE OR REPLACE VIEW public.pierrot_v_conversations_by_page
WITH (security_invoker = true) AS
SELECT
  start_page,
  COUNT(*)::BIGINT AS conversation_count,
  COUNT(DISTINCT session_id)::BIGINT AS session_count,
  SUM(message_count)::BIGINT AS message_count,
  AVG(duration_seconds)::NUMERIC(12, 2) AS average_duration_seconds
FROM public.pierrot_v_conversation_overview
GROUP BY start_page;

CREATE OR REPLACE VIEW public.pierrot_v_conversations_by_language
WITH (security_invoker = true) AS
SELECT
  language,
  COUNT(*)::BIGINT AS conversation_count,
  COUNT(DISTINCT session_id)::BIGINT AS session_count,
  SUM(message_count)::BIGINT AS message_count,
  AVG(duration_seconds)::NUMERIC(12, 2) AS average_duration_seconds
FROM public.pierrot_v_conversation_overview
GROUP BY language;

CREATE OR REPLACE VIEW public.pierrot_v_intent_distribution
WITH (security_invoker = true) AS
SELECT
  intent,
  COUNT(*)::BIGINT AS event_count,
  COUNT(DISTINCT conversation_id)::BIGINT AS conversation_count,
  COUNT(*) FILTER (WHERE intent_uncertain)::BIGINT AS uncertain_count
FROM public.pierrot_v_events
WHERE event_name = 'intent_classified'
  AND intent IS NOT NULL
GROUP BY intent;

CREATE OR REPLACE VIEW public.pierrot_v_navigation_destinations
WITH (security_invoker = true) AS
SELECT
  COALESCE(payload->>'section_id', 'unknown') AS section_id,
  COUNT(*) FILTER (WHERE event_name = 'navigation_suggested')::BIGINT AS suggested_count,
  COUNT(*) FILTER (WHERE event_name = 'navigation_completed')::BIGINT AS completed_count,
  COUNT(*) FILTER (WHERE event_name = 'action_clicked')::BIGINT AS action_clicked_count,
  COUNT(DISTINCT conversation_id)::BIGINT AS conversation_count
FROM public.pierrot_v_events
WHERE event_name IN ('navigation_suggested', 'navigation_completed', 'action_clicked')
GROUP BY COALESCE(payload->>'section_id', 'unknown');

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
    'checkout_started'
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
  COUNT(DISTINCT conversation_id)::BIGINT AS conversation_count
FROM signals
WHERE offer_id IS NOT NULL
GROUP BY offer_id;

CREATE OR REPLACE VIEW public.pierrot_v_product_interest
WITH (security_invoker = true) AS
SELECT
  offer_id,
  COUNT(DISTINCT conversation_id) FILTER (WHERE event_name = 'interest_detected')::BIGINT AS interested_conversations,
  COUNT(DISTINCT conversation_id) FILTER (WHERE event_name = 'offer_viewed')::BIGINT AS viewed_conversations,
  COUNT(DISTINCT conversation_id) FILTER (WHERE event_name = 'offer_action_clicked')::BIGINT AS clicked_conversations,
  COUNT(DISTINCT conversation_id) FILTER (WHERE event_name = 'purchase_completed')::BIGINT AS purchased_conversations
FROM (
  SELECT COALESCE(product_id, offer_id) AS offer_id, event_name, conversation_id
  FROM public.pierrot_v_events
  WHERE event_name IN ('interest_detected', 'offer_viewed', 'offer_action_clicked')
  UNION ALL
  SELECT offer_id, 'purchase_completed', conversation_id FROM public.pierrot_v_purchases
) signals
WHERE offer_id IS NOT NULL
GROUP BY offer_id;

CREATE OR REPLACE VIEW public.pierrot_v_conversation_duration
WITH (security_invoker = true) AS
SELECT conversation_id, started_at, ended_at, last_message_at, duration_seconds, status
FROM public.pierrot_v_conversation_overview;

CREATE OR REPLACE VIEW public.pierrot_v_retrieval_failures
WITH (security_invoker = true) AS
SELECT
  payload->>'outcome' AS outcome,
  COALESCE(payload->>'code', 'none') AS code,
  COUNT(*)::BIGINT AS event_count,
  COUNT(DISTINCT conversation_id)::BIGINT AS conversation_count
FROM public.pierrot_v_events
WHERE event_name = 'retrieval_performed'
  AND retrieval_failed
GROUP BY payload->>'outcome', COALESCE(payload->>'code', 'none');

CREATE OR REPLACE VIEW public.pierrot_v_unanswered_questions
WITH (security_invoker = true) AS
SELECT
  user_message.conversation_id,
  user_message.id AS message_id,
  user_message.created_at AS asked_at,
  user_message.content
FROM public.pierrot_messages user_message
LEFT JOIN LATERAL (
  SELECT next_message.role
  FROM public.pierrot_messages next_message
  WHERE next_message.conversation_id = user_message.conversation_id
    AND next_message.message_index > user_message.message_index
  ORDER BY next_message.message_index ASC
  LIMIT 1
) next_message ON TRUE
WHERE user_message.role = 'user'
  AND (next_message.role IS NULL OR next_message.role = 'user')
  AND user_message.created_at < NOW() - INTERVAL '5 minutes';

CREATE OR REPLACE VIEW public.pierrot_v_quality_indicators
WITH (security_invoker = true) AS
SELECT
  o.conversation_id,
  o.started_at,
  o.language,
  o.start_page,
  o.message_count,
  o.assistant_failure_count,
  o.retrieval_failure_count,
  o.purchase_count,
  COALESCE(unanswered.unanswered_count, 0)::BIGINT AS unanswered_count,
  COALESCE(feedback.positive_feedback, 0)::BIGINT AS positive_feedback,
  COALESCE(feedback.negative_feedback, 0)::BIGINT AS negative_feedback,
  COALESCE(corrections.correction_count, 0)::BIGINT AS correction_count
FROM public.pierrot_v_conversation_overview o
LEFT JOIN (
  SELECT conversation_id, COUNT(*)::BIGINT AS unanswered_count
  FROM public.pierrot_v_unanswered_questions
  GROUP BY conversation_id
) unanswered ON unanswered.conversation_id = o.conversation_id
LEFT JOIN (
  SELECT
    conversation_id,
    COUNT(*) FILTER (WHERE payload->>'rating' = 'up')::BIGINT AS positive_feedback,
    COUNT(*) FILTER (WHERE payload->>'rating' = 'down')::BIGINT AS negative_feedback
  FROM public.pierrot_events
  WHERE event_name = 'answer_feedback'
  GROUP BY conversation_id
) feedback ON feedback.conversation_id = o.conversation_id
LEFT JOIN (
  SELECT conversation_id, COUNT(*)::BIGINT AS correction_count
  FROM public.pierrot_events
  WHERE event_name = 'answer_corrected'
  GROUP BY conversation_id
) corrections ON corrections.conversation_id = o.conversation_id;

REVOKE ALL ON public.pierrot_v_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_intent_changes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_purchases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_message_counts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_conversation_overview FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_conversations_by_page FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_conversations_by_language FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_intent_distribution FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_navigation_destinations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_offer_funnel FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_product_interest FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_conversation_duration FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_retrieval_failures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_unanswered_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pierrot_v_quality_indicators FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.pierrot_v_events TO service_role;
GRANT SELECT ON public.pierrot_v_intent_changes TO service_role;
GRANT SELECT ON public.pierrot_v_purchases TO service_role;
GRANT SELECT ON public.pierrot_v_message_counts TO service_role;
GRANT SELECT ON public.pierrot_v_conversation_overview TO service_role;
GRANT SELECT ON public.pierrot_v_conversations_by_page TO service_role;
GRANT SELECT ON public.pierrot_v_conversations_by_language TO service_role;
GRANT SELECT ON public.pierrot_v_intent_distribution TO service_role;
GRANT SELECT ON public.pierrot_v_navigation_destinations TO service_role;
GRANT SELECT ON public.pierrot_v_offer_funnel TO service_role;
GRANT SELECT ON public.pierrot_v_product_interest TO service_role;
GRANT SELECT ON public.pierrot_v_conversation_duration TO service_role;
GRANT SELECT ON public.pierrot_v_retrieval_failures TO service_role;
GRANT SELECT ON public.pierrot_v_unanswered_questions TO service_role;
GRANT SELECT ON public.pierrot_v_quality_indicators TO service_role;
