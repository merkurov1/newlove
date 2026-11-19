-- Pierrot Dev — durable Actions dispatch outcomes and safe stale-marker recovery
-- Date: 2026-12-14
--
-- ADDITIVE ONLY. This migration adds nullable dispatch-observability columns and
-- two atomic functions. It does not delete, rewrite or backfill tasks, attempts,
-- events, workers or historical rows.
--
-- Why:
--   `actions_dispatch_requested_at` proved only that a repository_dispatch was
--   attempted. When the workflow was accepted but could not claim (another task
--   held the global active slot, a runner was stale, the queue was paused, the
--   task changed status, ...), the marker stayed set forever and the dispatcher
--   skipped the task on every later poll. That is the stuck-queue failure this
--   migration makes recoverable and observable.
--
-- Guarantees:
--   * every dispatch request has an explicit outcome, a reason/code, a
--     correlation id and a bounded attempt counter;
--   * a reservation is released only by an atomic function that locks the task,
--     proves it is still queued, checks the correlation/reservation revision and
--     refuses when an active attempt for that task owns it;
--   * retry state is durable (next_retry_at) so a transient conflict cannot
--     create an unbounded dispatch loop;
--   * the existing advisory lock (7340219), single-active-attempt index and
--     claim RPCs are untouched.
--
-- Manual application only. Do not apply to production automatically.

-- ---------------------------------------------------------------------------
-- Durable dispatch observability
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_status TEXT;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_reason_code TEXT;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_reason TEXT;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_correlation_id TEXT;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_last_attempt_at TIMESTAMPTZ;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_next_retry_at TIMESTAMPTZ;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.pierrot_dev_prompts
    DROP CONSTRAINT IF EXISTS pierrot_dev_prompts_actions_dispatch_status_check;

  ALTER TABLE public.pierrot_dev_prompts
    ADD CONSTRAINT pierrot_dev_prompts_actions_dispatch_status_check
    CHECK (
      actions_dispatch_status IS NULL
      OR actions_dispatch_status IN (
        'requested',
        'accepted',
        'claimable',
        'claimed',
        'retry_scheduled',
        'not_claimable',
        'ineligible',
        'failed'
      )
    );

  ALTER TABLE public.pierrot_dev_prompts
    DROP CONSTRAINT IF EXISTS pierrot_dev_prompts_actions_dispatch_attempts_check;

  ALTER TABLE public.pierrot_dev_prompts
    ADD CONSTRAINT pierrot_dev_prompts_actions_dispatch_attempts_check
    CHECK (actions_dispatch_attempts >= 0);
END $$;

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_actions_dispatch_retry_idx
  ON public.pierrot_dev_prompts (actions_dispatch_next_retry_at)
  WHERE status = 'queued' AND actions_dispatch_requested_at IS NOT NULL;

COMMENT ON COLUMN public.pierrot_dev_prompts.actions_dispatch_status IS
  'Explicit Actions dispatch state. Queued + requested/accepted is never running; only a claimed attempt is running.';

COMMENT ON COLUMN public.pierrot_dev_prompts.actions_dispatch_reason_code IS
  'Machine-readable last dispatch/claim outcome reason (for example ACTIVE_ATTEMPT_OTHER_TASK or STALE_WORKER).';

COMMENT ON COLUMN public.pierrot_dev_prompts.actions_dispatch_correlation_id IS
  'Correlation id sent to the workflow. A stale workflow cannot release a newer reservation.';

COMMENT ON COLUMN public.pierrot_dev_prompts.actions_dispatch_attempts IS
  'Bounded count of repository_dispatch requests for this queue entry. Owner retry resets it.';

-- ---------------------------------------------------------------------------
-- Atomic reservation / bounded retry renewal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_dev_reserve_actions_dispatch(
  p_task_id UUID,
  p_correlation_id TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_expected_requested_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.pierrot_dev_prompts%ROWTYPE;
  v_attempts INTEGER;
  v_max INTEGER;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'task id is required';
  END IF;

  -- Serialize against claims and every other dispatcher.
  PERFORM pg_advisory_xact_lock(7340219);

  SELECT p.* INTO v_task
    FROM public.pierrot_dev_prompts p
   WHERE p.id = p_task_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'TASK_NOT_FOUND');
  END IF;

  IF v_task.status <> 'queued' THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'TASK_NOT_QUEUED',
      'task_status', v_task.status
    );
  END IF;

  IF v_task.actions_dispatch_requested_at IS NULL THEN
    IF p_expected_requested_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'RESERVATION_MISSING');
    END IF;
  ELSE
    IF p_expected_requested_at IS NULL THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'ALREADY_REQUESTED',
        'requested_at', v_task.actions_dispatch_requested_at
      );
    END IF;
    IF v_task.actions_dispatch_requested_at IS DISTINCT FROM p_expected_requested_at THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'RESERVATION_CHANGED',
        'requested_at', v_task.actions_dispatch_requested_at
      );
    END IF;
  END IF;

  -- Dispatching while any attempt is active would only create a runner that
  -- cannot claim. The global single-active-attempt guarantee is preserved.
  IF EXISTS (
    SELECT 1 FROM public.pierrot_dev_attempts a
     WHERE a.status IN ('claimed', 'running')
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'ACTIVE_ATTEMPT');
  END IF;

  v_max := GREATEST(1, LEAST(COALESCE(p_max_attempts, 5), 20));
  v_attempts := COALESCE(v_task.actions_dispatch_attempts, 0);
  IF v_attempts >= v_max THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'RETRY_EXHAUSTED',
      'attempts', v_attempts
    );
  END IF;

  UPDATE public.pierrot_dev_prompts p
     SET actions_dispatch_requested_at = NOW(),
         actions_dispatch_status = 'requested',
         actions_dispatch_reason_code = NULL,
         actions_dispatch_reason = NULL,
         actions_dispatch_correlation_id = p_correlation_id,
         actions_dispatch_attempts = v_attempts + 1,
         actions_dispatch_last_attempt_at = NOW(),
         actions_dispatch_next_retry_at = NULL,
         actions_dispatch_updated_at = NOW(),
         assigned_executor = 'actions',
         updated_at = NOW()
   WHERE p.id = v_task.id
     AND p.status = 'queued'
  RETURNING p.* INTO v_task;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'task', to_jsonb(v_task),
    'attempts', v_attempts + 1,
    'correlation_id', p_correlation_id
  );
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_reserve_actions_dispatch(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_reserve_actions_dispatch(UUID, TEXT, INTEGER, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.pierrot_dev_reserve_actions_dispatch(UUID, TEXT, INTEGER, TIMESTAMPTZ) IS
  'Atomically reserves (or renews after a safe retry) one queued task for repository_dispatch. Refuses active attempts and bounded retry exhaustion.';

-- ---------------------------------------------------------------------------
-- Atomic outcome recording / conditional release
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_dev_complete_actions_dispatch(
  p_task_id UUID,
  p_correlation_id TEXT,
  p_outcome TEXT,
  p_reason_code TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_retry_at TIMESTAMPTZ DEFAULT NULL,
  p_expected_requested_at TIMESTAMPTZ DEFAULT NULL,
  p_terminal BOOLEAN DEFAULT FALSE,
  p_worker_id TEXT DEFAULT NULL,
  p_execution_id TEXT DEFAULT NULL,
  p_reset_attempts BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.pierrot_dev_prompts%ROWTYPE;
  v_action TEXT := 'recorded';
  v_blocker TEXT;
  v_reason TEXT;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'task id is required';
  END IF;
  IF p_outcome NOT IN ('accepted', 'claimed', 'retry', 'terminal') THEN
    RAISE EXCEPTION 'invalid dispatch outcome';
  END IF;

  PERFORM pg_advisory_xact_lock(7340219);

  SELECT p.* INTO v_task
    FROM public.pierrot_dev_prompts p
   WHERE p.id = p_task_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'TASK_NOT_FOUND');
  END IF;

  -- A stale workflow (older correlation) must never clear a newer reservation.
  IF p_correlation_id IS NOT NULL
     AND v_task.actions_dispatch_correlation_id IS NOT NULL
     AND v_task.actions_dispatch_correlation_id <> p_correlation_id THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'STALE_CORRELATION',
      'correlation_id', v_task.actions_dispatch_correlation_id
    );
  END IF;

  IF p_expected_requested_at IS NOT NULL
     AND v_task.actions_dispatch_requested_at IS DISTINCT FROM p_expected_requested_at THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'STALE_RESERVATION',
      'requested_at', v_task.actions_dispatch_requested_at
    );
  END IF;

  IF p_outcome = 'accepted' THEN
    UPDATE public.pierrot_dev_prompts p
       SET actions_dispatch_status = 'accepted',
           actions_dispatch_reason_code = p_reason_code,
           actions_dispatch_reason = p_reason,
           actions_dispatch_next_retry_at = NULL,
           actions_dispatch_updated_at = NOW(),
           updated_at = NOW()
     WHERE p.id = v_task.id
    RETURNING p.* INTO v_task;

    RETURN jsonb_build_object('ok', TRUE, 'action', 'accepted', 'task', to_jsonb(v_task));
  END IF;

  IF p_outcome = 'claimed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pierrot_dev_attempts a
       WHERE a.task_id = v_task.id
         AND a.status IN ('claimed', 'running')
    ) AND v_task.status <> 'in_progress' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'NO_ACTIVE_ATTEMPT');
    END IF;

    UPDATE public.pierrot_dev_prompts p
       SET actions_dispatch_status = 'claimed',
           actions_dispatch_reason_code = p_reason_code,
           actions_dispatch_reason = p_reason,
           actions_dispatch_next_retry_at = NULL,
           actions_dispatch_updated_at = NOW(),
           updated_at = NOW()
     WHERE p.id = v_task.id
    RETURNING p.* INTO v_task;

    RETURN jsonb_build_object('ok', TRUE, 'action', 'claimed', 'task', to_jsonb(v_task));
  END IF;

  -- retry / terminal: only a still-queued task without an owner attempt and
  -- without a deterministic blocker may have its reservation changed.
  IF v_task.status <> 'queued' THEN
    UPDATE public.pierrot_dev_prompts p
       SET actions_dispatch_status = 'ineligible',
           actions_dispatch_reason_code = 'TASK_NOT_QUEUED',
           actions_dispatch_reason = format('Task is %s, not queued.', v_task.status),
           actions_dispatch_next_retry_at = NULL,
           actions_dispatch_updated_at = NOW(),
           updated_at = NOW()
     WHERE p.id = v_task.id
    RETURNING p.* INTO v_task;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'ineligible',
      'code', 'TASK_NOT_QUEUED',
      'task', to_jsonb(v_task)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pierrot_dev_attempts a
     WHERE a.task_id = v_task.id
       AND a.status IN ('claimed', 'running')
  ) THEN
    UPDATE public.pierrot_dev_prompts p
       SET actions_dispatch_status = 'claimed',
           actions_dispatch_reason_code = 'ACTIVE_ATTEMPT_FOR_TASK',
           actions_dispatch_reason = 'An active attempt already owns this task; no retry was scheduled.',
           actions_dispatch_next_retry_at = NULL,
           actions_dispatch_updated_at = NOW(),
           updated_at = NOW()
     WHERE p.id = v_task.id
    RETURNING p.* INTO v_task;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'claimed',
      'code', 'ACTIVE_ATTEMPT_FOR_TASK',
      'task', to_jsonb(v_task)
    );
  END IF;

  v_blocker := NULL;
  v_reason := p_reason;

  IF v_task.blocked_reason IS NOT NULL THEN
    v_blocker := 'TASK_BLOCKED';
    v_reason := COALESCE(NULLIF(v_task.blocked_reason, ''), 'Task is blocked.');
  ELSIF EXISTS (
    SELECT 1
      FROM public.pierrot_dev_batch_items bi
      JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
     WHERE bi.task_id = v_task.id
       AND b.status = 'paused'
  ) THEN
    v_blocker := 'BATCH_PAUSED';
    v_reason := 'The task belongs to a paused batch.';
  ELSIF EXISTS (
    SELECT 1
      FROM public.pierrot_dev_batch_items dep_item
      JOIN public.pierrot_dev_prompts dep ON dep.id = dep_item.depends_on_task_id
     WHERE dep_item.task_id = v_task.id
       AND dep.status NOT IN ('verified', 'archived')
  ) THEN
    v_blocker := 'DEPENDENCY_BLOCKED';
    v_reason := 'A task dependency is not verified yet.';
  END IF;

  IF v_blocker IS NOT NULL THEN
    UPDATE public.pierrot_dev_prompts p
       SET actions_dispatch_status = 'not_claimable',
           actions_dispatch_reason_code = v_blocker,
           actions_dispatch_reason = v_reason,
           actions_dispatch_next_retry_at = NULL,
           actions_dispatch_updated_at = NOW(),
           updated_at = NOW()
     WHERE p.id = v_task.id
    RETURNING p.* INTO v_task;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'action', 'not_claimable',
      'code', v_blocker,
      'task', to_jsonb(v_task)
    );
  END IF;

  IF p_terminal OR p_reset_attempts THEN
    v_action := CASE WHEN p_terminal THEN 'terminal' ELSE 'reset' END;
  END IF;

  UPDATE public.pierrot_dev_prompts p
     SET actions_dispatch_status = CASE
           WHEN p_terminal THEN 'failed'
           WHEN p_retry_at IS NOT NULL AND p_retry_at > NOW() THEN 'retry_scheduled'
           ELSE 'retry_scheduled'
         END,
         actions_dispatch_reason_code = p_reason_code,
         actions_dispatch_reason = v_reason,
         actions_dispatch_requested_at = CASE
           WHEN p_terminal THEN p.actions_dispatch_requested_at
           WHEN p_retry_at IS NOT NULL AND p_retry_at > NOW() THEN p.actions_dispatch_requested_at
           ELSE NULL
         END,
         actions_dispatch_next_retry_at = CASE
           WHEN p_terminal THEN NULL
           WHEN p_retry_at IS NOT NULL AND p_retry_at > NOW() THEN p_retry_at
           ELSE NULL
         END,
         actions_dispatch_attempts = CASE
           WHEN p_reset_attempts THEN 0
           ELSE p.actions_dispatch_attempts
         END,
         actions_dispatch_updated_at = NOW(),
         updated_at = NOW()
   WHERE p.id = v_task.id
  RETURNING p.* INTO v_task;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'action', CASE
      WHEN p_terminal THEN 'terminal'
      WHEN p_reset_attempts THEN 'reset'
      WHEN p_retry_at IS NOT NULL AND p_retry_at > NOW() THEN 'retry_scheduled'
      ELSE 'released'
    END,
    'code', COALESCE(p_reason_code, 'DISPATCH_RETRY'),
    'task', to_jsonb(v_task)
  );
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_complete_actions_dispatch(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_complete_actions_dispatch(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN
) TO service_role;

COMMENT ON FUNCTION public.pierrot_dev_complete_actions_dispatch(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, BOOLEAN
) IS
  'Records an accepted/claimed outcome or conditionally releases a dispatch reservation. Only a still-queued task with no active attempt and no deterministic blocker can be released.';

-- ---------------------------------------------------------------------------
-- Existing approved scheduler: extend the 5-minute knowledge tick instead of
-- adding a new cron schedule. The endpoint is a bounded, idempotent dispatcher.
-- ---------------------------------------------------------------------------

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
  v_dispatch_request bigint;
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

  -- Recover a stale dispatch marker and (at most) dispatch one eligible task.
  -- This reuses the existing tick; no new five-minute schedule is introduced.
  v_dispatch_request := net.http_post(
    v_base || '/api/cron/pierrot-dev-dispatch',
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
    'media_request_id', v_media_request,
    'dispatch_request_id', v_dispatch_request
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brain_worker_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_worker_tick() TO service_role;

COMMENT ON FUNCTION public.brain_worker_tick() IS
  'Scheduler tick: posts to the protected Brain, Graph, Media and Pierrot Dev dispatch endpoints. No-op without Vault secrets.';

-- Manual verification (not executed automatically):
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'pierrot_dev_prompts'
--      AND column_name LIKE 'actions_dispatch_%'
--    ORDER BY column_name;
--   SELECT pg_get_functiondef('public.pierrot_dev_reserve_actions_dispatch(uuid,text,integer,timestamptz)'::regprocedure);
--   SELECT pg_get_functiondef('public.pierrot_dev_complete_actions_dispatch(uuid,text,text,text,text,timestamptz,timestamptz,boolean,text,text,boolean)'::regprocedure);
-- Expected:
--   * two concurrent dispatchers reserve at most one row (marker compare-and-set);
--   * a stale workflow correlation cannot release a newer reservation;
--   * a task with an active attempt or unsatisfied dependency keeps its marker;
--   * owner reset sets actions_dispatch_attempts back to 0.
