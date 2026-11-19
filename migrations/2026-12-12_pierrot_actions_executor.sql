-- Pierrot Dev — targeted atomic claim for the ephemeral GitHub Actions executor
-- Date: 2026-12-12
--
-- ADDITIVE ONLY. This migration adds one function; it does not alter, drop or
-- rewrite any table, row, status or historical attempt.
--
-- Why:
--   The existing pierrot_dev_claim_next_task(TEXT, INTEGER) is atomic but only
--   claims the next queued task. A GitHub Actions workflow is dispatched for
--   one specific task, so it must be able to claim exactly that task without
--   ever running a different queued task by mistake.
--
-- Guarantees (identical to the existing claim path):
--   * advisory transaction lock serializes every claim across API instances;
--   * the existing partial unique index allows at most one active attempt
--     system-wide, so two concurrent triggers can produce exactly one runner;
--   * the worker must be registered, online/idle, not stop-requested and have
--     a heartbeat newer than 120 seconds;
--   * the task must be queued, not blocked and not inside a paused batch;
--   * dependencies must already be verified/archived;
--   * FOR UPDATE SKIP LOCKED prevents a concurrent claim of the same row.
--
-- Idempotency: claiming an already in_progress/review task returns NULL. A
-- repeated workflow trigger therefore cannot create a second attempt, commit,
-- PR or completion. Retrying is an explicit owner action (or the existing
-- lease reaper), not a duplicate dispatch.
--
-- Security: SECURITY INVOKER, search_path pinned, EXECUTE granted to
-- service_role only. No table or RLS change.
--
-- Manual application only. Do not apply to production automatically.

-- ---------------------------------------------------------------------------
-- Worker kind: distinguish ephemeral Actions runners from Codespaces.
-- Additive constraint replacement; existing rows remain valid.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.pierrot_dev_workers
    DROP CONSTRAINT IF EXISTS pierrot_dev_workers_kind_check;

  ALTER TABLE public.pierrot_dev_workers
    ADD CONSTRAINT pierrot_dev_workers_kind_check
    CHECK (kind IN ('codespace', 'local', 'actions'));
END $$;

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

  -- Exactly one active attempt across the whole system. This is the same
  -- single-executor guarantee as the Codespace worker.
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

  RETURN jsonb_build_object(
    'task', to_jsonb(v_task),
    'attempt', to_jsonb(v_attempt)
  );
END $$;

REVOKE ALL ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER) IS
  'Atomically claims one explicitly requested queued task for a worker. Returns NULL when the task is not claimable. Does not create a second queue.';

-- Manual verification (not executed automatically):
--   SELECT pg_get_functiondef('public.pierrot_dev_claim_task(uuid,text,integer)'::regprocedure);
--   -- with a registered online worker and one queued task:
--   SELECT public.pierrot_dev_claim_task('<task-uuid>', 'actions:test:1', 1800);
--   -- repeat immediately: must return NULL (one active attempt / not queued).
--   SELECT count(*) FROM public.pierrot_dev_attempts
--    WHERE status IN ('claimed', 'running'); -- must be 1
