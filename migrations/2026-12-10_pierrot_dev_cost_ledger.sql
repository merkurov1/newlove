-- Pierrot Dev Cost Ledger — append-only pre-queue estimates
-- Date: 2026-12-10
--
-- ADDITIVE ONLY. Do NOT apply automatically to production.
--
-- The actual per-attempt cost lives inside pierrot_dev_attempts.verification
-- because each attempt is already immutable history. This table only stores the
-- estimate that must exist BEFORE a task becomes queued, together with the
-- version/source of every tariff used. Rows are append-only: a retry creates a
-- new estimate instead of rewriting the historical one.
--
-- Security: RLS enabled, no PUBLIC/anon/authenticated grants, service_role only.

CREATE TABLE IF NOT EXISTS public.pierrot_dev_cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL
    REFERENCES public.pierrot_dev_prompts(id) ON DELETE CASCADE,
  batch_id UUID
    REFERENCES public.pierrot_dev_batches(id) ON DELETE SET NULL,
  estimate JSONB NOT NULL
    CHECK (jsonb_typeof(estimate) = 'object' AND pg_column_size(estimate) <= 32768),
  pricing_version TEXT NOT NULL CHECK (length(btrim(pricing_version)) BETWEEN 1 AND 200),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(btrim(currency)) BETWEEN 1 AND 12),
  source TEXT NOT NULL DEFAULT 'enqueue'
    CHECK (length(btrim(source)) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_dev_cost_estimates_task_idx
  ON public.pierrot_dev_cost_estimates (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pierrot_dev_cost_estimates_batch_idx
  ON public.pierrot_dev_cost_estimates (batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.pierrot_dev_cost_estimates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_dev_cost_estimates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pierrot_dev_cost_estimates TO service_role;

-- Manual application:
--   psql "$SUPABASE_DB_URL" -f migrations/2026-12-10_pierrot_dev_cost_ledger.sql
-- Never apply this migration automatically from the application.
