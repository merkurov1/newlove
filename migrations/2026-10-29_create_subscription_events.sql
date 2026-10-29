-- Migration: reliable subscription analytics
-- Date: 2026-10-29
--
-- Kept separate from Pierrot conversations and from service leads. Payloads
-- must never contain email addresses, names or message text.

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL
    CHECK (event_name IN (
      'subscription_submitted',
      'subscription_confirmed',
      'subscription_failed',
      'unsubscribe'
    )),
  event_key TEXT NOT NULL UNIQUE
    CHECK (event_key ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  subscriber_id TEXT,
  conversation_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 2048),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_events_name_idx
  ON public.subscription_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_events_subscriber_idx
  ON public.subscription_events (subscriber_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subscription_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.subscription_events TO service_role;

COMMENT ON TABLE public.subscription_events IS
  'Server-only subscription lifecycle events; no email or personal content.';
