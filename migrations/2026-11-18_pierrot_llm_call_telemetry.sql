-- Pierrot / AI per-call telemetry
-- Date: 2026-11-18
--
-- ADDITIVE ONLY. Do NOT apply automatically to production.
--
-- One row per provider attempt. A fallback or a retry adds a new row instead
-- of overwriting the failed attempt. Tokens and costs are nullable on purpose:
-- a missing provider usage value must stay unknown, never 0.
--
-- Privacy: no prompt, history, answer or RAG text is stored. Only character
-- counts, token counts, provider/model identifiers and error codes are kept.
--
-- Security: RLS enabled, no PUBLIC/anon/authenticated grants, service_role only.
-- The admin dashboard reads this table through the server-side service client.

CREATE TABLE IF NOT EXISTS public.pierrot_llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT CHECK (request_id IS NULL OR length(request_id) <= 160),
  conversation_id TEXT CHECK (conversation_id IS NULL OR length(conversation_id) <= 160),
  session_id TEXT CHECK (session_id IS NULL OR length(session_id) <= 160),
  user_id TEXT CHECK (user_id IS NULL OR length(user_id) <= 160),
  surface TEXT NOT NULL CHECK (surface IN (
    'pierrot_web',
    'pierrot_stream',
    'question',
    'flow_issue',
    'flow_item',
    'brain',
    'media',
    'intake',
    'art_engine',
    'evaluation',
    'unknown'
  )),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'deepseek', 'openrouter', 'openai', 'other')),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 160),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1 AND attempt <= 20),
  is_retry BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_from TEXT CHECK (fallback_from IS NULL OR fallback_from IN ('gemini', 'deepseek', 'openrouter', 'openai', 'other')),
  ok BOOLEAN NOT NULL,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  finish_reason TEXT CHECK (finish_reason IS NULL OR length(finish_reason) <= 160),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 160),
  prompt_chars INTEGER CHECK (prompt_chars IS NULL OR prompt_chars >= 0),
  response_chars INTEGER CHECK (response_chars IS NULL OR response_chars >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  usage_source TEXT NOT NULL CHECK (usage_source IN ('provider_reported', 'partial', 'unknown')),
  estimated_cost_usd NUMERIC(18, 8) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  cost_source TEXT NOT NULL CHECK (cost_source IN ('provider_reported', 'estimated_from_tariff', 'unknown')),
  pricing_version TEXT CHECK (pricing_version IS NULL OR length(pricing_version) <= 200),
  pricing_source TEXT CHECK (pricing_source IS NULL OR length(pricing_source) <= 240),
  provider_reported_cost_usd NUMERIC(18, 8)
    CHECK (provider_reported_cost_usd IS NULL OR provider_reported_cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_llm_calls_occurred_idx
  ON public.pierrot_llm_calls (occurred_at DESC);
CREATE INDEX IF NOT EXISTS pierrot_llm_calls_provider_idx
  ON public.pierrot_llm_calls (provider, model, occurred_at DESC);
CREATE INDEX IF NOT EXISTS pierrot_llm_calls_surface_idx
  ON public.pierrot_llm_calls (surface, occurred_at DESC);
CREATE INDEX IF NOT EXISTS pierrot_llm_calls_request_idx
  ON public.pierrot_llm_calls (request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pierrot_llm_calls_conversation_idx
  ON public.pierrot_llm_calls (conversation_id, occurred_at DESC)
  WHERE conversation_id IS NOT NULL;

ALTER TABLE public.pierrot_llm_calls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_llm_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pierrot_llm_calls TO service_role;

-- Manual application:
--   psql "$SUPABASE_DB_URL" -f migrations/2026-11-18_pierrot_llm_call_telemetry.sql
-- Never apply this migration automatically from the application.
--
-- Verification:
--   SELECT provider, count(*), count(input_tokens), count(estimated_cost_usd)
--   FROM public.pierrot_llm_calls
--   WHERE occurred_at > now() - interval '1 day'
--   GROUP BY provider;
