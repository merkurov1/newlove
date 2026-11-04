-- Pierrot Dev Mode — engineering environment
-- Date: 2026-11-04
--
-- ADDITIVE ONLY. Do not apply automatically to production.
--
-- Production already contained public.pierrot_dev_prompts with zero rows and
-- no matching repository migration. This migration documents that table and
-- extends it for Task Studio. All ALTER TABLE statements use IF NOT EXISTS so
-- the migration is safe to review and apply against the existing schema.
--
-- It also adds:
--   * pierrot_dev_requests — per-request status, latency, token usage,
--     tool traces, errors and side effects;
--   * service-role-only access and RLS for both tables.
--
-- Apply manually with the project's migrations workflow, then verify:
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'pierrot_dev_prompts';
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'pierrot_dev_requests';
--
--   SELECT relname, relrowsecurity
--   FROM pg_class WHERE relname IN ('pierrot_dev_prompts', 'pierrot_dev_requests');

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Task Studio storage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  repository TEXT,
  base_ref TEXT,
  base_commit TEXT,
  task TEXT,
  prompt_text TEXT,
  affected_files TEXT[],
  backend_changes TEXT[],
  mobile_changes TEXT[],
  migrations TEXT[],
  tests TEXT[],
  acceptance_criteria TEXT[],
  security_constraints TEXT[],
  unverified TEXT[],
  conversation_id TEXT,
  decision_ids UUID[],
  status TEXT,
  verification_status TEXT,
  verification_notes TEXT,
  result_commit TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS context TEXT,
  ADD COLUMN IF NOT EXISTS current_behavior TEXT,
  ADD COLUMN IF NOT EXISTS required_behavior TEXT,
  ADD COLUMN IF NOT EXISTS technical_plan TEXT,
  ADD COLUMN IF NOT EXISTS frontend_changes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS database_changes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pull_requests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS result_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_report JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_user_updated_idx
  ON public.pierrot_dev_prompts (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_status_idx
  ON public.pierrot_dev_prompts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_conversation_idx
  ON public.pierrot_dev_prompts (conversation_id);

-- ---------------------------------------------------------------------------
-- Request observability
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE
    CHECK (request_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  conversation_id TEXT NOT NULL
    REFERENCES public.pierrot_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partially_completed')),
  provider TEXT,
  model TEXT,
  message_excerpt TEXT,
  response_text TEXT,
  response_message_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens INTEGER CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  tool_trace JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(tool_trace) = 'array' AND pg_column_size(tool_trace) <= 262144),
  events JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(events) = 'array' AND pg_column_size(events) <= 131072),
  side_effects JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(side_effects) = 'array' AND pg_column_size(side_effects) <= 32768),
  error_code TEXT,
  error_message TEXT,
  repository TEXT,
  base_ref TEXT,
  commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS pierrot_dev_requests_conversation_idx
  ON public.pierrot_dev_requests (conversation_id, started_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_dev_requests_status_idx
  ON public.pierrot_dev_requests (status, started_at DESC);

CREATE INDEX IF NOT EXISTS pierrot_dev_requests_user_idx
  ON public.pierrot_dev_requests (user_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Privacy model: server-only, same as the other Pierrot private tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_dev_prompts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_requests FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.pierrot_dev_prompts TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_requests TO service_role;

COMMENT ON TABLE public.pierrot_dev_prompts IS
  'Owner-only engineering tasks for Pierrot Dev Mode. Created from Dev conversations; no public access.';
COMMENT ON TABLE public.pierrot_dev_requests IS
  'Server-only Dev request traces: status, provider, latency, tokens, tools, errors and side effects. No secrets.';
COMMENT ON COLUMN public.pierrot_dev_requests.tool_trace IS
  'Compact tool metadata only. Tokens, authorization headers and full private responses are never stored.';
COMMENT ON COLUMN public.pierrot_dev_prompts.status IS
  'draft | ready | in_progress | review | verified | rejected | archived';

-- Manual verification queries (not executed automatically):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename IN ('pierrot_dev_prompts', 'pierrot_dev_requests');
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('public.pierrot_dev_prompts'::regclass,
--                      'public.pierrot_dev_requests'::regclass);
