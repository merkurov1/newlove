-- Pierrot Dev Workbench — lease recovery with one automatic retry
-- Date: 2026-12-09
--
-- ADDITIVE ONLY. This migration replaces a function; it does not add, drop or
-- rewrite tables, tasks, workers, attempts or historical attempt rows.
--
-- Behaviour of public.pierrot_dev_reap_expired_attempts(INTEGER):
--   * an expired active attempt is finalized as timed_out with LEASE_EXPIRED;
--   * the first lease expiry for a task returns the in-progress task to
--     'queued' with a fresh queued_at and keeps priority/queue_position;
--   * a later lease expiry for the same task marks the task 'failed';
--   * only one automatic retry is allowed.
--
-- attempt_number is the per-task execution sequence assigned by the claim RPC.
-- attempt_count is the denormalized highest attempt number started for the
-- task. Neither is a retry counter: an owner can requeue a task and raise both
-- values without any automatic retry being used. The reaper therefore derives
-- "the automatic lease retry was already used" from immutable attempt history:
-- exactly one earlier timed_out attempt with error_code = 'LEASE_EXPIRED',
-- with a lower attempt_number than the expired attempt, spends the retry.
-- This makes a third automatic launch impossible even if attempt_count is
-- stale or was edited.
--
-- Locking: expired attempts are selected with FOR UPDATE SKIP LOCKED. The
-- finalizing UPDATE re-checks the active status, so a repeated or concurrent
-- reaper cannot process an already finalized attempt again. The task row is
-- locked FOR UPDATE before its status is changed, and the event journal uses
-- the existing dedupe_key/ON CONFLICT mechanism.
--
-- Manual application and verification are documented at the end of the file.

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
    -- Finalize the attempt only while it is still active. The status guard is
    -- what makes a repeated reaper idempotent.
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

    -- Serialize task decisions for this task. This also protects against a
    -- concurrent claim/requeue while the retry budget is being evaluated.
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
        -- First automatic retry: return the task to the queue. priority and
        -- queue_position are deliberately left untouched. blocked_reason is
        -- the only task-level lock that would prevent the next claim.
        UPDATE public.pierrot_dev_prompts p
           SET status = 'queued',
               queued_at = NOW(),
               blocked_reason = NULL,
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
        -- The single automatic retry was already used: stop the loop here.
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

    -- Only the worker that still owns the expired attempt is taken offline.
    -- A worker that has already moved to a newer attempt is never disturbed.
    IF v_attempt.worker_id IS NOT NULL THEN
      UPDATE public.pierrot_dev_workers w
         SET status = 'offline',
             current_task_id = NULL,
             current_attempt_id = NULL,
             updated_at = NOW()
       WHERE w.id = v_attempt.worker_id
         AND w.current_attempt_id = v_attempt.id;
    END IF;

    -- The event states explicitly whether the task went back to the queue or
    -- was finalized as failed. dedupe_key prevents duplicate reaper events.
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
  'Finalizes expired worker leases. The first lease expiry requeues the task; later expiries fail it. Attempt history is never rewritten.';

-- Manual verification (not executed automatically):
--   SELECT pg_get_functiondef('public.pierrot_dev_reap_expired_attempts(integer)'::regprocedure);
--   SELECT public.pierrot_dev_reap_expired_attempts(20);
-- Expected for one expired first attempt:
--   attempt.status = 'timed_out', attempt.error_code = 'LEASE_EXPIRED';
--   task.status = 'queued', task.priority/queue_position unchanged;
--   event.type = 'attempt.lease_expired', payload.returnedToQueue = true;
--   worker.current_attempt_id = NULL only when it still pointed at that attempt.
-- A repeated call returns 0 for already finalized attempts and inserts no
-- duplicate event because dedupe_key = 'lease-expired:<attempt_id>'.
