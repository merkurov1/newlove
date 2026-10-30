-- Migration: owner-configurable Pierrot offer policies
-- Date: 2026-10-30
--
-- Product facts, prices, availability and checkout remain in the existing
-- postcards/subscribers/payment sources. This table configures only the
-- recommendation policy: enablement, priority, frequency, cooldown and copy.
-- CTA destinations remain verified in code and are deliberately not editable
-- through this table.

CREATE TABLE IF NOT EXISTS public.pierrot_offer_policies (
  offer_id TEXT PRIMARY KEY
    CHECK (offer_id IN (
      'heart_angel_postcard',
      'journal_flow',
      'art_engine',
      'advising',
      'unframed'
    )),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0
    CHECK (priority BETWEEN 0 AND 1000),
  max_shows_per_conversation INTEGER NOT NULL DEFAULT 3
    CHECK (max_shows_per_conversation BETWEEN 1 AND 20),
  cooldown_turns INTEGER NOT NULL DEFAULT 2
    CHECK (cooldown_turns BETWEEN 0 AND 50),
  cooldown_seconds INTEGER NOT NULL DEFAULT 60
    CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  min_interest_score DOUBLE PRECISION NOT NULL DEFAULT 1.5
    CHECK (min_interest_score BETWEEN 0 AND 100),
  requires_repeated_engagement BOOLEAN NOT NULL DEFAULT FALSE,
  allow_proactive BOOLEAN NOT NULL DEFAULT TRUE,
  recommendation_copy TEXT
    CHECK (recommendation_copy IS NULL OR char_length(recommendation_copy) <= 300),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

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
  ('heart_angel_postcard', TRUE, 30, 3, 2, 45, 1.5, FALSE, TRUE),
  ('unframed', TRUE, 20, 3, 2, 60, 1.5, FALSE, TRUE),
  ('journal_flow', TRUE, 10, 2, 4, 120, 2.5, TRUE, TRUE),
  ('art_engine', TRUE, 5, 1, 8, 300, 99, FALSE, FALSE),
  ('advising', TRUE, 5, 1, 8, 300, 99, FALSE, FALSE)
ON CONFLICT (offer_id) DO NOTHING;

ALTER TABLE public.pierrot_offer_policies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_offer_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pierrot_offer_policies TO service_role;

COMMENT ON TABLE public.pierrot_offer_policies IS
  'Owner-only recommendation policy for Pierrot offers; prices, stock and checkout remain in existing product sources.';
