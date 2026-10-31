-- Migration: resource safety, worker locks, budgets and observability
-- Date: 2026-11-11
--
-- Backward-compatible additions only. No existing table, job, document,
-- embedding or analysis row is modified or deleted.
--
-- This migration does NOT create or enable any schedule. It only adds the
-- storage and atomic functions required for controlled manual workers.

-- ---------------------------------------------------------------------------
-- 1. Runtime settings (kill switch and per-worker enable flags)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ops_runtime_settings (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 120),
  value jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(value) IN ('boolean', 'object')),
  updated_by text CHECK (updated_by IS NULL OR char_length(updated_by) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ops_runtime_settings (key, value)
VALUES
  ('workers_enabled', 'true'::jsonb),
  (
    'worker_scopes',
    '{"brain":true,"graph":true,"media":true,"newsletter":true,"retention":true}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.ops_runtime_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_runtime_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_runtime_settings TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Global worker locks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.worker_locks (
  lock_key text PRIMARY KEY CHECK (char_length(lock_key) BETWEEN 1 AND 120),
  owner_id text NOT NULL CHECK (char_length(owner_id) BETWEEN 1 AND 200),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192)
);

CREATE INDEX IF NOT EXISTS worker_locks_expires_idx
  ON public.worker_locks (expires_at);

ALTER TABLE public.worker_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.worker_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.worker_locks TO service_role;

CREATE OR REPLACE FUNCTION public.claim_worker_lock(
  p_lock_key text,
  p_owner text,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ttl integer := GREATEST(60, LEAST(3600, COALESCE(p_ttl_seconds, 900)));
  v_expires timestamptz;
  v_claimed boolean := false;
  v_recovered integer := 0;
  v_current_expires timestamptz;
BEGIN
  IF p_lock_key IS NULL OR char_length(p_lock_key) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_lock_key' USING ERRCODE = '22023';
  END IF;

  IF p_owner IS NULL OR char_length(p_owner) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_lock_owner' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.worker_locks
  WHERE lock_key = p_lock_key
    AND expires_at < now();

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  v_expires := now() + make_interval(secs => v_ttl);

  INSERT INTO public.worker_locks (
    lock_key,
    owner_id,
    acquired_at,
    heartbeat_at,
    expires_at,
    metadata
  )
  VALUES (
    p_lock_key,
    p_owner,
    now(),
    now(),
    v_expires,
    '{}'::jsonb
  )
  ON CONFLICT (lock_key) DO NOTHING
  RETURNING true INTO v_claimed;

  IF v_claimed IS NULL THEN
    v_claimed := false;
  END IF;

  IF NOT v_claimed THEN
    SELECT expires_at INTO v_current_expires
    FROM public.worker_locks
    WHERE lock_key = p_lock_key;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_claimed THEN 'acquired' ELSE 'conflict' END,
    'recovered', v_recovered > 0,
    'expires_at', CASE WHEN v_claimed THEN v_expires ELSE v_current_expires END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_worker_lock(
  p_lock_key text,
  p_owner text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released boolean := false;
  v_count integer := 0;
BEGIN
  DELETE FROM public.worker_locks
  WHERE lock_key = p_lock_key
    AND owner_id = p_owner;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_released := v_count > 0;
  RETURN v_released;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_worker_lock(
  p_lock_key text,
  p_owner text,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ttl integer := GREATEST(60, LEAST(3600, COALESCE(p_ttl_seconds, 900)));
  v_updated boolean := false;
  v_count integer := 0;
BEGIN
  UPDATE public.worker_locks
  SET heartbeat_at = now(),
      expires_at = now() + make_interval(secs => v_ttl),
      metadata = jsonb_set(metadata, '{heartbeat_at}', to_jsonb(now()), true)
  WHERE lock_key = p_lock_key
    AND owner_id = p_owner
    AND expires_at > now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_updated := v_count > 0;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_worker_lock(text, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_worker_lock(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_worker_lock(text, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_worker_lock(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_worker_lock(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_worker_lock(text, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Operational events (no user content, no secrets)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ops_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name text NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 80),
  scope text CHECK (scope IS NULL OR char_length(scope) <= 80),
  worker_id text CHECK (worker_id IS NULL OR char_length(worker_id) <= 200),
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_events_created_idx
  ON public.ops_events (created_at DESC);

CREATE INDEX IF NOT EXISTS ops_events_scope_created_idx
  ON public.ops_events (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_events_name_created_idx
  ON public.ops_events (event_name, created_at DESC);

ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ops_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Circuit breakers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ops_circuit_breakers (
  dependency text PRIMARY KEY CHECK (char_length(dependency) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half_open')),
  consecutive_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  opened_at timestamptz,
  open_until timestamptz,
  reopen_count integer NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_circuit_breakers_state_idx
  ON public.ops_circuit_breakers (state, open_until);

ALTER TABLE public.ops_circuit_breakers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ops_circuit_breakers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_circuit_breakers TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Recovery queries for orphaned Brain / Graph work
-- ---------------------------------------------------------------------------

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
  WHERE r.status NOT IN ('paused', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM public.brain_ingestion_jobs j
      WHERE j.run_id = r.id
        AND j.status IN ('queued', 'processing')
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
  WHERE r.status NOT IN ('paused', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM public.brain_graph_jobs j
      WHERE j.run_id = r.id
        AND j.status IN ('queued', 'processing')
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

-- ---------------------------------------------------------------------------
-- 6. Read-only scheduler status for the Operations Dashboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ops_scheduler_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cron_jobs integer := 0;
  v_last_cron jsonb := NULL;
  v_base boolean := false;
  v_secret boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM cron.job' INTO v_cron_jobs;
  END IF;

  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT jsonb_build_object(
        'jobid', jobid,
        'command', command,
        'status', status,
        'start_time', start_time,
        'end_time', end_time
      )
      FROM cron.job_run_details
      ORDER BY start_time DESC
      LIMIT 1
    $sql$ INTO v_last_cron;
  END IF;

  IF to_regclass('vault.secrets') IS NOT NULL THEN
    EXECUTE $sql$SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'brain_worker_base_url')$sql$
      INTO v_base;
    EXECUTE $sql$SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'brain_worker_cron_secret')$sql$
      INTO v_secret;
  END IF;

  RETURN jsonb_build_object(
    'cron_jobs', v_cron_jobs,
    'last_cron_run', v_last_cron,
    'vault_secrets', jsonb_build_object(
      'brain_worker_base_url', v_base,
      'brain_worker_cron_secret', v_secret
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_scheduler_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_scheduler_status() TO service_role;

COMMENT ON TABLE public.ops_runtime_settings IS
  'Owner-only kill switch and per-worker enable flags. No schedules are stored here.';
COMMENT ON TABLE public.worker_locks IS
  'Lease-based global worker locks with TTL and stale-lock recovery.';
COMMENT ON TABLE public.ops_events IS
  'Compact operational telemetry. Never store user content or secrets.';
COMMENT ON TABLE public.ops_circuit_breakers IS
  'Per-dependency circuit breaker state with bounded cooldown.';
COMMENT ON FUNCTION public.ops_scheduler_status() IS
  'Read-only snapshot of pg_cron and Vault scheduler configuration for the admin dashboard.';
