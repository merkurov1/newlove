-- Knowledge worker lifecycle, parent-run finalization and a real scheduler.
--
-- 1. A run whose jobs are all terminal was previously invisible to the worker:
--    brain_list_recoverable_runs / graph_list_recoverable_runs only returned
--    runs with an active (queued/processing) job, so the parent run could stay
--    "running" forever. Both RPCs now also return an old running run whose jobs
--    are all terminal, allowing the worker to finalize it.
-- 2. brain_worker_tick() now also calls the Media analysis worker.
-- 3. The pg_cron schedule is created idempotently. It is a no-op when Vault
--    secrets are absent.

CREATE OR REPLACE FUNCTION public.brain_list_recoverable_runs(
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.brain_ingestion_runs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.*
  FROM public.brain_ingestion_runs r
  WHERE r.status = 'running'
    AND (
      EXISTS (
        SELECT 1
        FROM public.brain_ingestion_jobs j
        WHERE j.run_id = r.id
          AND j.status IN ('queued', 'processing')
      )
      -- A run with only terminal jobs can be finalized. The grace period
      -- avoids racing a run that was created microseconds ago.
      OR r.created_at < now() - interval '2 minutes'
    )
  ORDER BY r.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.graph_list_recoverable_runs(
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.brain_graph_runs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.*
  FROM public.brain_graph_runs r
  WHERE r.status = 'running'
    AND (
      EXISTS (
        SELECT 1
        FROM public.brain_graph_jobs j
        WHERE j.run_id = r.id
          AND j.status IN ('queued', 'processing')
      )
      OR r.created_at < now() - interval '2 minutes'
    )
  ORDER BY r.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.brain_list_recoverable_runs(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.graph_list_recoverable_runs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_list_recoverable_runs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.graph_list_recoverable_runs(integer) TO service_role;

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
  v_media_request bigint;
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

  v_media_request := net.http_post(
    v_base || '/api/cron/media-analysis-worker',
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
    'graph_request_id', v_graph_request,
    'media_request_id', v_media_request
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_worker_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_worker_tick() TO service_role;

COMMENT ON FUNCTION public.brain_worker_tick() IS
  'Scheduler tick: posts to the protected Brain, Graph and Media worker endpoints. No-op without Vault secrets.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE 'SELECT cron.unschedule(''brain-worker-tick'')';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE 'SELECT cron.unschedule(''knowledge-worker-tick'')';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE 'SELECT cron.schedule(''knowledge-worker-tick'', ''*/5 * * * *'', ''SELECT public.brain_worker_tick()'')';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'knowledge-worker-tick schedule could not be created: %', SQLERRM;
    END;
  END IF;
END $$;
