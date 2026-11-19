-- Pierrot Dev — durable Actions routing and no-Codespaces-fallback guard
-- Date: 2026-12-13
--
-- ADDITIVE ONLY. This migration adds two nullable columns and replaces three
-- functions. It does not delete, rewrite or backfill tasks, attempts, events,
-- workers or historical rows.
--
-- Why:
--   Automatic execution moved from the long-lived Codespace to the ephemeral
--   GitHub Actions executor. The dispatcher must persist the routing decision
--   before it calls repository_dispatch, otherwise a running Codespace worker
--   could claim the same queued task in the gap between dispatch and claim.
--
-- Guarantees:
--   * assigned_executor ('actions' | 'codespace') is a task-level routing lock;
--   * a worker may claim a task only when the task is unassigned or assigned to
--     the worker's own kind ('actions' or 'codespace');
--   * a targeted claim (pierrot_dev_claim_task) is accepted only from an
--     Actions worker and preserves the same advisory lock, single-active-attempt
--     guard and FOR UPDATE SKIP LOCKED as the queue claim;
--   * actions_dispatch_requested_at is a duplicate-launch guard, not a success
--     flag. It is cleared on enqueue/retry/batch start/lease recovery;
--   * the lease reaper clears the dispatch marker when it returns a task to the
--     queue, but keeps the existing executor assignment.
--
-- Manual application only. Do not apply to production automatically.

-- ---------------------------------------------------------------------------
-- Durable columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS assigned_executor TEXT;

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS actions_dispatch_requested_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.pierrot_dev_prompts
    DROP CONSTRAINT IF EXISTS pierrot_dev_prompts_assigned_executor_check;

  ALTER TABLE public.pierrot_dev_prompts
    ADD CONSTRAINT pierrot_dev_prompts_assigned_executor_check
    CHECK (assigned_executor IS NULL OR assigned_executor IN ('actions', 'codespace'));
END $$;

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_actions_dispatch_idx
  ON public.pierrot_dev_prompts (status, priority DESC, queue_position ASC)
  WHERE status = 'queued' AND actions_dispatch_requested_at IS NULL;

COMMENT ON COLUMN public.pierrot_dev_prompts.assigned_executor IS
  'Durable routing decision: actions = ephemeral GitHub Actions runner, codespace = manual Codespace reserve, NULL = legacy unassigned task.';

COMMENT ON COLUMN public.pierrot_dev_prompts.actions_dispatch_requested_at IS
  'Timestamp of the last repository_dispatch request. Used only to prevent duplicate launches; cleared on enqueue/retry/recovery.';

-- ---------------------------------------------------------------------------
-- Next-queued claim: respect the task routing decision
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_dev_claim_next_task(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 1800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.pierrot_dev_prompts%ROWTYPE;
  v_attempt public.pierrot_dev_attempts%ROWTYPE;
  v_next_attempt INTEGER;
  v_branch TEXT;
  v_lease INTEGER;
  v_batch_id UUID;
  v_paused BOOLEAN;
BEGIN
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) < 4 THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;

  -- Serialize claims across every API instance. Combined with the partial
  -- unique index on active attempts this makes double-claim impossible.
  PERFORM pg_advisory_xact_lock(7340219);

  v_lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 1800), 21600));

  SELECT COALESCE((value #>> '{}')::BOOLEAN, FALSE)
    INTO v_paused
    FROM public.pierrot_dev_settings
   WHERE key = 'queue_paused';

  IF COALESCE(v_paused, FALSE) THEN
    RETURN NULL;
  END IF;

  -- Worker must be registered and recently alive.
  IF NOT EXISTS (
    SELECT 1 FROM public.pierrot_dev_workers w
     WHERE w.id = p_worker_id
       AND w.status IN ('online', 'idle')
       AND w.stop_requested = FALSE
       AND w.last_heartbeat_at IS NOT NULL
       AND w.last_heartbeat_at > NOW() - INTERVAL '120 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  -- Exactly one active attempt across the whole system.
  IF EXISTS (
    SELECT 1 FROM public.pierrot_dev_attempts a
     WHERE a.status IN ('claimed', 'running')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.*
    INTO v_task
    FROM public.pierrot_dev_prompts p
   WHERE p.status = 'queued'
     AND p.blocked_reason IS NULL
     -- Routing guard: a Codespace worker must never take an Actions task or an
     -- unassigned legacy task. GitHub Actions is the standard executor, so a
     -- NULL assignment is claimable only by an Actions worker. The manual
     -- Codespace reserve must be assigned explicitly (assigned_executor =
     -- 'codespace') after an owner-approved rollback.
     AND (
       p.assigned_executor = (
         SELECT w.kind FROM public.pierrot_dev_workers w WHERE w.id = p_worker_id
       )
       OR (
         p.assigned_executor IS NULL
         AND (
           SELECT w.kind FROM public.pierrot_dev_workers w WHERE w.id = p_worker_id
         ) = 'actions'
       )
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.pierrot_dev_batch_items bi
         JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
        WHERE bi.task_id = p.id
          AND b.status = 'paused'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.pierrot_dev_batch_items dep_item
         JOIN public.pierrot_dev_prompts dep
           ON dep.id = dep_item.depends_on_task_id
        WHERE dep_item.task_id = p.id
          AND dep.status NOT IN ('verified', 'archived')
     )
   ORDER BY p.priority DESC,
            COALESCE((
              SELECT b.priority
                FROM public.pierrot_dev_batch_items bi
                JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
               WHERE bi.task_id = p.id AND b.status = 'active'
               ORDER BY b.priority DESC, bi.position ASC
               LIMIT 1
            ), 0) DESC,
            COALESCE((
              SELECT bi.position
                FROM public.pierrot_dev_batch_items bi
                JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
               WHERE bi.task_id = p.id AND b.status = 'active'
               ORDER BY b.priority DESC, bi.position ASC
               LIMIT 1
            ), p.queue_position, 2147483647) ASC,
            p.queued_at ASC NULLS FIRST,
            p.created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(a.attempt_number), 0) + 1
    INTO v_next_attempt
    FROM public.pierrot_dev_attempts a
   WHERE a.task_id = v_task.id;

  SELECT bi.batch_id INTO v_batch_id
    FROM public.pierrot_dev_batch_items bi
    JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
   WHERE bi.task_id = v_task.id
     AND b.status = 'active'
   ORDER BY bi.position ASC
   LIMIT 1;

  v_branch := 'pierrot/dev/' || v_task.id::text || '/' || v_next_attempt::text;

  INSERT INTO public.pierrot_dev_attempts (
    task_id, attempt_number, batch_id, worker_id, status, branch,
    base_ref, base_commit, started_at, heartbeat_at, lease_expires_at,
    progress_stage
  ) VALUES (
    v_task.id, v_next_attempt, v_batch_id, p_worker_id, 'claimed', v_branch,
    COALESCE(v_task.base_ref, 'main'), v_task.base_commit, NOW(), NOW(),
    NOW() + make_interval(secs => v_lease), 'claimed'
  )
  RETURNING * INTO v_attempt;

  UPDATE public.pierrot_dev_prompts
     SET status = 'in_progress',
         attempt_count = GREATEST(attempt_count, v_next_attempt),
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
   WHERE id = v_task.id;

  UPDATE public.pierrot_dev_workers
     SET status = 'busy',
         current_task_id = v_task.id,
         current_attempt_id = v_attempt.id,
         last_heartbeat_at = NOW(),
         updated_at = NOW()
   WHERE id = p_worker_id;

  INSERT INTO public.pierrot_dev_events (task_id, attempt_id, worker_id, type, message, payload)
  VALUES (
    v_task.id, v_attempt.id, p_worker_id, 'attempt.claimed', 'Worker claimed the task',
    jsonb_build_object(
      'attempt', v_next_attempt,
      'branch', v_branch,
      'assignedExecutor', v_task.assigned_executor
    )
  );

  RETURN jsonb_build_object(
    'task', to_jsonb(v_task),
    'attempt', to_jsonb(v_attempt)
  );
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_claim_next_task(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_claim_next_task(TEXT, INTEGER)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Targeted claim: Actions-only and routed-task-only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_dev_claim_task(
  p_task_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 1800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task public.pierrot_dev_prompts%ROWTYPE;
  v_attempt public.pierrot_dev_attempts%ROWTYPE;
  v_next_attempt INTEGER;
  v_branch TEXT;
  v_lease INTEGER;
  v_batch_id UUID;
  v_paused BOOLEAN;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'task id is required';
  END IF;
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) < 4 THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;

  -- Serialize claims across every API instance. Combined with the partial
  -- unique index on active attempts this makes double-claim impossible.
  PERFORM pg_advisory_xact_lock(7340219);

  v_lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 1800), 21600));

  SELECT COALESCE((value #>> '{}')::BOOLEAN, FALSE)
    INTO v_paused
    FROM public.pierrot_dev_settings
   WHERE key = 'queue_paused';

  IF COALESCE(v_paused, FALSE) THEN
    RETURN NULL;
  END IF;

  -- Targeted claims are an Actions-only capability.
  IF NOT EXISTS (
    SELECT 1 FROM public.pierrot_dev_workers w
     WHERE w.id = p_worker_id
       AND w.kind = 'actions'
       AND w.status IN ('online', 'idle')
       AND w.stop_requested = FALSE
       AND w.last_heartbeat_at IS NOT NULL
       AND w.last_heartbeat_at > NOW() - INTERVAL '120 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  -- Exactly one active attempt across the whole system.
  IF EXISTS (
    SELECT 1 FROM public.pierrot_dev_attempts a
     WHERE a.status IN ('claimed', 'running')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.*
    INTO v_task
    FROM public.pierrot_dev_prompts p
   WHERE p.id = p_task_id
     AND p.status = 'queued'
     AND p.blocked_reason IS NULL
     AND (p.assigned_executor IS NULL OR p.assigned_executor = 'actions')
     AND NOT EXISTS (
       SELECT 1
         FROM public.pierrot_dev_batch_items bi
         JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
        WHERE bi.task_id = p.id
          AND b.status = 'paused'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.pierrot_dev_batch_items dep_item
         JOIN public.pierrot_dev_prompts dep
           ON dep.id = dep_item.depends_on_task_id
        WHERE dep_item.task_id = p.id
          AND dep.status NOT IN ('verified', 'archived')
     )
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(a.attempt_number), 0) + 1
    INTO v_next_attempt
    FROM public.pierrot_dev_attempts a
   WHERE a.task_id = v_task.id;

  SELECT bi.batch_id INTO v_batch_id
    FROM public.pierrot_dev_batch_items bi
    JOIN public.pierrot_dev_batches b ON b.id = bi.batch_id
   WHERE bi.task_id = v_task.id
     AND b.status = 'active'
   ORDER BY bi.position ASC
   LIMIT 1;

  v_branch := 'pierrot/dev/' || v_task.id::text || '/' || v_next_attempt::text;

  INSERT INTO public.pierrot_dev_attempts (
    task_id, attempt_number, batch_id, worker_id, status, branch,
    base_ref, base_commit, started_at, heartbeat_at, lease_expires_at,
    progress_stage
  ) VALUES (
    v_task.id, v_next_attempt, v_batch_id, p_worker_id, 'claimed', v_branch,
    COALESCE(v_task.base_ref, 'main'), v_task.base_commit, NOW(), NOW(),
    NOW() + make_interval(secs => v_lease), 'claimed'
  )
  RETURNING * INTO v_attempt;

  UPDATE public.pierrot_dev_prompts
     SET status = 'in_progress',
         attempt_count = GREATEST(attempt_count, v_next_attempt),
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
   WHERE id = v_task.id;

  UPDATE public.pierrot_dev_workers
     SET status = 'busy',
         current_task_id = v_task.id,
         current_attempt_id = v_attempt.id,
         updated_at = NOW()
   WHERE id = p_worker_id;

  INSERT INTO public.pierrot_dev_events (task_id, attempt_id, worker_id, type, message, payload)
  VALUES (
    v_task.id, v_attempt.id, p_worker_id, 'attempt.claimed', 'Actions runner claimed the dispatched task',
    jsonb_build_object(
      'attempt', v_next_attempt,
      'branch', v_branch,
      'assignedExecutor', v_task.assigned_executor,
      'targeted', TRUE
    )
  );

  RETURN jsonb_build_object(
    'task', to_jsonb(v_task),
    'attempt', to_jsonb(v_attempt)
  );
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Lease recovery: clear the dispatch marker when a task is requeued
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pierrot_dev_reap_expired_attempts(
  p_limit INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired public.pierrot_dev_attempts%ROWTYPE;
  v_attempt public.pierrot_dev_attempts%ROWTYPE;
  v_task public.pierrot_dev_prompts%ROWTYPE;
  v_previous_lease_failure BOOLEAN := FALSE;
  v_updated INTEGER := 0;
  v_count INTEGER := 0;
  v_outcome TEXT := 'skipped';
  v_returned_to_queue BOOLEAN := FALSE;
  v_finalized BOOLEAN := FALSE;
BEGIN
  FOR v_expired IN
    SELECT a.*
      FROM public.pierrot_dev_attempts a
     WHERE a.status IN ('claimed', 'running')
       AND a.lease_expires_at IS NOT NULL
       AND a.lease_expires_at < NOW()
     ORDER BY a.lease_expires_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.pierrot_dev_attempts a
       SET status = 'timed_out',
           finished_at = NOW(),
           error_code = 'LEASE_EXPIRED',
           error_message = 'The worker lease expired before completion.',
           progress_stage = 'timed_out',
           updated_at = NOW()
     WHERE a.id = v_expired.id
       AND a.status IN ('claimed', 'running')
    RETURNING * INTO v_attempt;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      CONTINUE;
    END IF;

    SELECT p.*
      INTO v_task
      FROM public.pierrot_dev_prompts p
     WHERE p.id = v_attempt.task_id
       FOR UPDATE;

    v_previous_lease_failure := FALSE;
    IF v_task.id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.pierrot_dev_attempts h
         WHERE h.task_id = v_attempt.task_id
           AND h.id <> v_attempt.id
           AND h.attempt_number < v_attempt.attempt_number
           AND h.status = 'timed_out'
           AND h.error_code = 'LEASE_EXPIRED'
      )
      INTO v_previous_lease_failure;
    END IF;

    v_outcome := 'skipped';
    v_returned_to_queue := FALSE;
    v_finalized := FALSE;

    IF v_task.id IS NOT NULL AND v_task.status = 'in_progress' THEN
      IF NOT v_previous_lease_failure THEN
        -- First automatic retry: return the task to the queue. The executor
        -- routing is preserved, but the dispatch marker is cleared so the
        -- server-side Actions dispatcher can launch a fresh runner.
        UPDATE public.pierrot_dev_prompts p
           SET status = 'queued',
               queued_at = NOW(),
               blocked_reason = NULL,
               assigned_executor = COALESCE(v_task.assigned_executor, 'actions'),
               actions_dispatch_requested_at = NULL,
               last_error_code = 'LEASE_EXPIRED',
               last_error_message = 'The worker lease expired before completion. The task was returned to the queue for one automatic retry.',
               updated_at = NOW()
         WHERE p.id = v_task.id
           AND p.status = 'in_progress';

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
          v_outcome := 'requeued';
          v_returned_to_queue := TRUE;
        END IF;
      ELSE
        UPDATE public.pierrot_dev_prompts p
           SET status = 'failed',
               last_error_code = 'LEASE_EXPIRED',
               last_error_message = 'The worker lease expired again after the single automatic retry. The task was marked failed.',
               updated_at = NOW()
         WHERE p.id = v_task.id
           AND p.status = 'in_progress';

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
          v_outcome := 'failed';
          v_finalized := TRUE;
        END IF;
      END IF;
    END IF;

    IF v_attempt.worker_id IS NOT NULL THEN
      UPDATE public.pierrot_dev_workers w
         SET status = 'offline',
             current_task_id = NULL,
             current_attempt_id = NULL,
             updated_at = NOW()
       WHERE w.id = v_attempt.worker_id
         AND w.current_attempt_id = v_attempt.id;
    END IF;

    INSERT INTO public.pierrot_dev_events (
      task_id, attempt_id, worker_id, type, level, message, payload, dedupe_key
    ) VALUES (
      v_attempt.task_id,
      v_attempt.id,
      v_attempt.worker_id,
      'attempt.lease_expired',
      'error',
      CASE v_outcome
        WHEN 'requeued' THEN
          'Worker lease expired; attempt timed out and the task was returned to the queue for one automatic retry.'
        WHEN 'failed' THEN
          'Worker lease expired again; attempt timed out and the task was marked failed.'
        ELSE
          'Worker lease expired; attempt timed out. The task was not changed because it is no longer in progress.'
      END,
      jsonb_build_object(
        'attemptNumber', v_attempt.attempt_number,
        'attemptCount', v_task.attempt_count,
        'outcome', v_outcome,
        'returnedToQueue', v_returned_to_queue,
        'finalizedAsFailed', v_finalized,
        'automaticRetryAlreadyUsed', v_previous_lease_failure,
        'taskStatus', v_task.status,
        'queuePosition', v_task.queue_position,
        'priority', v_task.priority,
        'assignedExecutor', v_task.assigned_executor,
        'reason', 'LEASE_EXPIRED'
      ),
      'lease-expired:' || v_attempt.id::text
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_reap_expired_attempts(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_reap_expired_attempts(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.pierrot_dev_reap_expired_attempts(INTEGER) IS
  'Finalizes expired worker leases. The first lease expiry requeues the task and clears the Actions dispatch marker; later expiries fail it. Attempt history is never rewritten.';

COMMENT ON FUNCTION public.pierrot_dev_claim_next_task(TEXT, INTEGER) IS
  'Atomically claims the next queued task whose assigned_executor matches the worker kind (or is unassigned). Preserves one-active-attempt and queue ordering.';

COMMENT ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER) IS
  'Atomically claims one explicitly dispatched queued task for an Actions worker. Returns NULL for a Codespace worker, a codespace-assigned task or an already claimed task.';

-- Manual verification (not executed automatically):
--   SELECT pg_get_functiondef('public.pierrot_dev_claim_next_task(text,integer)'::regprocedure);
--   SELECT pg_get_functiondef('public.pierrot_dev_claim_task(uuid,text,integer)'::regprocedure);
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'pierrot_dev_prompts'
--      AND column_name IN ('assigned_executor', 'actions_dispatch_requested_at');
-- Expected:
--   * a Codespace worker receives NULL for an actions-assigned task;
--   * an Actions worker receives NULL for a codespace-assigned task;
--   * repeated/concurrent claims leave exactly one active attempt;
--   * the reaper clears actions_dispatch_requested_at only on requeue.
