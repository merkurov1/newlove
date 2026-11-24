-- Pierrot Dev — bounded automatic execution retry and manual review handoff
-- Date: 2026-12-16
--
-- ADDITIVE ONLY. Do NOT apply automatically to production.
--
-- Why:
--   A transient OpenCode failure (timeout, interrupted process, missing final
--   report) used to stop at `failed` and required an owner click. The executor
--   contract requires a small number of automatic attempts with bounded
--   backoff, and a durable `manual_review` state once that budget is spent so
--   a broken task can never loop forever.
--
-- Guarantees:
--   * `retry_after_at` is the only new column. It is nullable and defaults to
--     NULL, so every existing row is immediately eligible.
--   * both claim RPCs (next-queued and targeted) refuse a task whose
--     `retry_after_at` is in the future and clear it atomically on claim;
--   * `manual_review` is added to the existing status check. No row is
--     rewritten, no attempt history is touched.
--   * the advisory lock (7340219), single-active-attempt index, worker
--     freshness check, ownership checks and lease recovery are unchanged.
--
-- Manual application only. Do not apply to production automatically.

-- ---------------------------------------------------------------------------
-- Backoff eligibility column
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS retry_after_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_retry_after_idx
  ON public.pierrot_dev_prompts (retry_after_at)
  WHERE status = 'queued';

COMMENT ON COLUMN public.pierrot_dev_prompts.retry_after_at IS
  'Earliest time a queued task may be claimed again after an automatic retry. NULL means immediately eligible.';

-- ---------------------------------------------------------------------------
-- Existing status vocabulary plus manual_review
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.pierrot_dev_prompts
    DROP CONSTRAINT IF EXISTS pierrot_dev_prompts_status_check;

  ALTER TABLE public.pierrot_dev_prompts
    ADD CONSTRAINT pierrot_dev_prompts_status_check
    CHECK (status IN (
      'draft',
      'ready',
      'queued',
      'in_progress',
      'review',
      'verified',
      'failed',
      'manual_review',
      'rejected',
      'cancelled',
      'archived',
      'blocked',
      'used'
    ));
END $$;

-- ---------------------------------------------------------------------------
-- Atomic next-queued claim with retry eligibility
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
     -- Bounded automatic-retry backoff: not eligible before its timestamp.
     AND (p.retry_after_at IS NULL OR p.retry_after_at <= NOW())
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
         retry_after_at = NULL,
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
    jsonb_build_object('attempt', v_next_attempt, 'branch', v_branch)
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
-- Atomic targeted claim with retry eligibility
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

  PERFORM pg_advisory_xact_lock(7340219);

  v_lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 1800), 21600));

  SELECT COALESCE((value #>> '{}')::BOOLEAN, FALSE)
    INTO v_paused
    FROM public.pierrot_dev_settings
   WHERE key = 'queue_paused';

  IF COALESCE(v_paused, FALSE) THEN
    RETURN NULL;
  END IF;

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
     -- Bounded automatic-retry backoff: a targeted dispatch must not bypass it.
     AND (p.retry_after_at IS NULL OR p.retry_after_at <= NOW())
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
         retry_after_at = NULL,
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
  'Atomically claims one explicitly requested queued task when its retry backoff has elapsed. Returns NULL when it is not eligible.';

-- Manual verification (not executed automatically):
--   SELECT pg_get_functiondef('public.pierrot_dev_claim_next_task(text,integer)'::regprocedure);
--   SELECT pg_get_functiondef('public.pierrot_dev_claim_task(uuid,text,integer)'::regprocedure);
--   SELECT status, retry_after_at FROM public.pierrot_dev_prompts WHERE status = 'queued';
--   -- A future retry_after_at must make both claim functions return NULL.
--   -- Repeat immediately after a successful claim: must return NULL.
