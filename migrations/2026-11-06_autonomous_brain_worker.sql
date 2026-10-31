-- Migration: autonomous Brain / Graph workers
-- Date: 2026-11-06
--
-- Adds retry backoff to graph jobs, worker telemetry, recovery indexes, and an
-- optional Supabase pg_cron schedule that calls the protected Vercel worker
-- endpoints. The schedule is a no-op until two Vault secrets exist:
--
--   brain_worker_base_url      e.g. https://www.merkurov.love
--   brain_worker_cron_secret   the same value as Vercel CRON_SECRET
--
-- Vercel Hobby Cron is once per day only; this database schedule is the
-- higher-frequency option when pg_cron is available. Both paths call the same
-- idempotent worker endpoints.

-- ---------------------------------------------------------------------------
-- 1. Graph retry/lease support
-- ---------------------------------------------------------------------------

ALTER TABLE public.brain_graph_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;

CREATE INDEX IF NOT EXISTS brain_graph_jobs_claim_idx
  ON public.brain_graph_jobs (status, retry_after, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS brain_ingestion_jobs_processing_lease_idx
  ON public.brain_ingestion_jobs (locked_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS brain_graph_jobs_processing_lease_idx
  ON public.brain_graph_jobs (locked_at)
  WHERE status = 'processing';

-- Preserve duplicate rows as cancelled history, but keep only one active job
-- per normalized source URL / document. This prevents two workers from
-- processing the same document concurrently across different runs.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY normalized_url
    ORDER BY (status = 'processing') DESC, created_at, id
  ) AS rank
  FROM public.brain_ingestion_jobs
  WHERE status IN ('queued', 'processing')
)
UPDATE public.brain_ingestion_jobs j
SET status = 'cancelled',
    error_code = 'duplicate_active_source',
    error_detail = 'A newer active job for the same source already exists; this duplicate was cancelled safely.',
    worker_id = NULL,
    locked_at = NULL,
    retry_after = NULL,
    processed_at = now(),
    updated_at = now()
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rank > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY document_id
    ORDER BY (status = 'processing') DESC, created_at, id
  ) AS rank
  FROM public.brain_graph_jobs
  WHERE status IN ('queued', 'processing')
)
UPDATE public.brain_graph_jobs j
SET status = 'cancelled',
    error_code = 'duplicate_active_document',
    error_detail = 'Another active graph job for this document already exists; this duplicate was cancelled safely.',
    worker_id = NULL,
    locked_at = NULL,
    retry_after = NULL,
    updated_at = now()
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS brain_ingestion_jobs_active_url_uidx
  ON public.brain_ingestion_jobs (normalized_url)
  WHERE status IN ('queued', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS brain_graph_jobs_active_document_uidx
  ON public.brain_graph_jobs (document_id)
  WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION public.brain_claim_next_graph_job(
  p_run_id uuid,
  p_worker text
)
RETURNS SETOF public.brain_graph_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT id INTO v_job_id
  FROM public.brain_graph_jobs
  WHERE run_id = p_run_id
    AND status = 'queued'
    AND (retry_after IS NULL OR retry_after <= now())
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.brain_graph_jobs j
  SET status = 'processing',
      worker_id = p_worker,
      locked_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempts = j.attempts + 1,
      retry_after = NULL,
      updated_at = now()
  WHERE j.id = v_job_id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_claim_next_graph_job(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_claim_next_graph_job(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Worker telemetry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('brain', 'graph')),
  trigger text NOT NULL CHECK (trigger IN ('cron', 'admin', 'scheduler')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed', 'skipped')),
  worker_id text CHECK (worker_id IS NULL OR char_length(worker_id) <= 200),
  processed integer NOT NULL DEFAULT 0 CHECK (processed >= 0),
  claimed integer NOT NULL DEFAULT 0 CHECK (claimed >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  runs_touched integer NOT NULL DEFAULT 0 CHECK (runs_touched >= 0),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 120),
  error_detail text CHECK (error_detail IS NULL OR char_length(error_detail) <= 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_worker_runs_scope_started_idx
  ON public.brain_worker_runs (scope, started_at DESC);

CREATE INDEX IF NOT EXISTS brain_worker_runs_status_finished_idx
  ON public.brain_worker_runs (status, finished_at DESC);

ALTER TABLE public.brain_worker_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brain_worker_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_worker_runs TO service_role;

COMMENT ON TABLE public.brain_worker_runs IS
  'Owner-only telemetry for cron/admin Brain and Graph worker invocations.';
COMMENT ON COLUMN public.brain_graph_jobs.retry_after IS
  'Exponential backoff gate for queued graph jobs. Claimed only when NULL or in the past.';

-- ---------------------------------------------------------------------------
-- 3. Optional Supabase pg_cron -> Vercel worker trigger
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be enabled: %', SQLERRM;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.brain_worker_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  v_base text;
  v_secret text;
  v_brain_request bigint;
  v_graph_request bigint;
BEGIN
  SELECT decrypted_secret INTO v_base
  FROM vault.decrypted_secrets
  WHERE name = 'brain_worker_base_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'brain_worker_cron_secret'
  LIMIT 1;

  IF v_base IS NULL OR v_base = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'missing_vault_secrets',
      'required', jsonb_build_array('brain_worker_base_url', 'brain_worker_cron_secret')
    );
  END IF;

  v_base := rtrim(v_base, '/');

  v_brain_request := net.http_post(
    v_base || '/api/cron/brain-worker',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  v_graph_request := net.http_post(
    v_base || '/api/cron/graph-worker',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    5000
  );

  RETURN jsonb_build_object(
    'status', 'queued',
    'brain_request_id', v_brain_request,
    'graph_request_id', v_graph_request
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_worker_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_worker_tick() TO service_role;

COMMENT ON FUNCTION public.brain_worker_tick() IS
  'Optional pg_cron tick: posts to the protected Vercel Brain and Graph worker endpoints. No-op without Vault secrets.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE 'SELECT cron.unschedule(''brain-worker-tick'')';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE 'SELECT cron.schedule(''brain-worker-tick'', ''*/5 * * * *'', ''SELECT public.brain_worker_tick()'')';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'brain-worker-tick schedule could not be created: %', SQLERRM;
    END;
  END IF;
END $$;
