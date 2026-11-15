-- Pierrot Dev Workbench — engineering execution queue, attempts and ledger
-- Date: 2026-11-22
--
-- ADDITIVE ONLY. Do NOT apply automatically to production.
--
-- Reuses the existing Task Studio table public.pierrot_dev_prompts and adds
-- the minimum set of tables required for a single sequential Codespaces
-- worker:
--   * pierrot_dev_batches      — ordered packages of tasks
--   * pierrot_dev_batch_items  — task order and dependencies inside a batch
--   * pierrot_dev_attempts     — one immutable record per execution attempt
--   * pierrot_dev_events       — append-only execution journal
--   * pierrot_dev_workers      — worker registration, heartbeat and lease
--   * pierrot_dev_settings     — queue pause / safe operational flags
--
-- Concurrency model: exactly one worker, exactly one active attempt, enforced
-- by a row-locked claim function (FOR UPDATE SKIP LOCKED) plus a global
-- "no active attempt" guard. No custom distributed system.
--
-- Security: RLS on every table, no PUBLIC/anon/authenticated access, no
-- SECURITY DEFINER RPC, execute rights on internal RPCs granted to
-- service_role only.
--
-- Manual application and verification are documented at the end of this file.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_dev_batches_status_idx
  ON public.pierrot_dev_batches (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pierrot_dev_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL
    REFERENCES public.pierrot_dev_batches(id) ON DELETE CASCADE,
  task_id UUID NOT NULL
    REFERENCES public.pierrot_dev_prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  depends_on_task_id UUID
    REFERENCES public.pierrot_dev_prompts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, task_id),
  CHECK (depends_on_task_id IS NULL OR depends_on_task_id <> task_id)
);

CREATE INDEX IF NOT EXISTS pierrot_dev_batch_items_batch_idx
  ON public.pierrot_dev_batch_items (batch_id, position);
CREATE INDEX IF NOT EXISTS pierrot_dev_batch_items_task_idx
  ON public.pierrot_dev_batch_items (task_id);

-- ---------------------------------------------------------------------------
-- Queue columns on the existing Task Studio table
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_prompts
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_position INTEGER,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_batch_id UUID
    REFERENCES public.pierrot_dev_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

CREATE INDEX IF NOT EXISTS pierrot_dev_prompts_queue_idx
  ON public.pierrot_dev_prompts (status, priority DESC, queue_position ASC NULLS LAST, queued_at ASC)
  WHERE status = 'queued';

-- Keep the original vocabulary for old rows and add the workbench states.
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
      'rejected',
      'cancelled',
      'archived',
      'blocked',
      'used'
    ));
END $$;

-- ---------------------------------------------------------------------------
-- Execution attempts (append-only history, one row per retry)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL
    REFERENCES public.pierrot_dev_prompts(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  batch_id UUID
    REFERENCES public.pierrot_dev_batches(id) ON DELETE SET NULL,
  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created',
      'claimed',
      'running',
      'completed',
      'failed',
      'cancelled',
      'timed_out'
    )),
  branch TEXT,
  base_ref TEXT,
  base_commit TEXT,
  head_sha TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  opencode_session_id TEXT,
  exit_code INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  progress_stage TEXT,
  result_summary TEXT,
  changed_files TEXT[] NOT NULL DEFAULT '{}',
  commands JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(commands) = 'array' AND pg_column_size(commands) <= 65536),
  verification JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(verification) = 'object' AND pg_column_size(verification) <= 65536),
  warnings TEXT[] NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  log_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS pierrot_dev_attempts_task_idx
  ON public.pierrot_dev_attempts (task_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS pierrot_dev_attempts_status_idx
  ON public.pierrot_dev_attempts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS pierrot_dev_attempts_lease_idx
  ON public.pierrot_dev_attempts (lease_expires_at)
  WHERE status IN ('claimed', 'running');

-- Hard database guarantee: at most one active attempt in the whole system.
-- The claim function is also serialized by an advisory lock, so two workers
-- can never claim two different tasks at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS pierrot_dev_attempts_single_active_idx
  ON public.pierrot_dev_attempts ((1))
  WHERE status IN ('claimed', 'running');

-- ---------------------------------------------------------------------------
-- Append-only event journal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_events (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID REFERENCES public.pierrot_dev_prompts(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.pierrot_dev_attempts(id) ON DELETE CASCADE,
  worker_id TEXT,
  type TEXT NOT NULL CHECK (length(btrim(type)) BETWEEN 1 AND 80),
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL CHECK (length(message) <= 4000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 32768),
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pierrot_dev_events_dedupe_idx
  ON public.pierrot_dev_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pierrot_dev_events_task_idx
  ON public.pierrot_dev_events (task_id, id DESC);
CREATE INDEX IF NOT EXISTS pierrot_dev_events_attempt_idx
  ON public.pierrot_dev_events (attempt_id, id);

-- ---------------------------------------------------------------------------
-- Worker registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_workers (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9._:-]{4,120}$'),
  user_id UUID,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'codespace'
    CHECK (kind IN ('codespace', 'local')),
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'idle', 'busy', 'draining', 'offline', 'error')),
  version TEXT,
  hostname TEXT,
  codespace_name TEXT,
  repository TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(capabilities) = 'object' AND pg_column_size(capabilities) <= 32768),
  current_task_id UUID REFERENCES public.pierrot_dev_prompts(id) ON DELETE SET NULL,
  current_attempt_id UUID REFERENCES public.pierrot_dev_attempts(id) ON DELETE SET NULL,
  last_heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pierrot_dev_workers_heartbeat_idx
  ON public.pierrot_dev_workers (last_heartbeat_at DESC);

-- ---------------------------------------------------------------------------
-- Operational settings (tiny, auditable, server-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pierrot_dev_settings (
  key TEXT PRIMARY KEY CHECK (length(btrim(key)) BETWEEN 1 AND 80),
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.pierrot_dev_settings (key, value)
VALUES ('queue_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS and privileges: server-only, no SECURITY DEFINER
-- ---------------------------------------------------------------------------

ALTER TABLE public.pierrot_dev_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pierrot_dev_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pierrot_dev_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_batch_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_workers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pierrot_dev_settings FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.pierrot_dev_batches TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_batch_items TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_attempts TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_events TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_workers TO service_role;
GRANT ALL ON TABLE public.pierrot_dev_settings TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.pierrot_dev_events_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic claim: one worker, one active attempt, row lock, skip locked
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
-- Lease expiry detection
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
  v_attempt RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_attempt IN
    SELECT a.*
      FROM public.pierrot_dev_attempts a
     WHERE a.status IN ('claimed', 'running')
       AND a.lease_expires_at IS NOT NULL
       AND a.lease_expires_at < NOW()
     ORDER BY a.lease_expires_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.pierrot_dev_attempts
       SET status = 'timed_out',
           finished_at = NOW(),
           error_code = COALESCE(error_code, 'LEASE_EXPIRED'),
           error_message = COALESCE(error_message, 'The worker lease expired before completion.'),
           updated_at = NOW()
     WHERE id = v_attempt.id;

    UPDATE public.pierrot_dev_prompts
       SET status = 'failed',
           last_error_code = 'LEASE_EXPIRED',
           last_error_message = 'The worker lease expired before completion.',
           updated_at = NOW()
     WHERE id = v_attempt.task_id
       AND status = 'in_progress';

    UPDATE public.pierrot_dev_workers
       SET status = 'offline',
           current_task_id = NULL,
           current_attempt_id = NULL,
           updated_at = NOW()
     WHERE id = v_attempt.worker_id
       AND current_attempt_id = v_attempt.id;

    INSERT INTO public.pierrot_dev_events (
      task_id, attempt_id, worker_id, type, level, message, dedupe_key
    ) VALUES (
      v_attempt.task_id, v_attempt.id, v_attempt.worker_id, 'attempt.lease_expired', 'error',
      'Worker lease expired; attempt marked timed_out.',
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

COMMENT ON TABLE public.pierrot_dev_batches IS
  'Owner-only ordered packages of Dev tasks. Server access only.';
COMMENT ON TABLE public.pierrot_dev_attempts IS
  'Immutable execution attempt history. Retry creates a new row; old rows are never overwritten.';
COMMENT ON TABLE public.pierrot_dev_events IS
  'Append-only execution journal. dedupe_key makes repeated delivery idempotent.';
COMMENT ON TABLE public.pierrot_dev_workers IS
  'Registered Codespaces worker state, heartbeat and current lease holder.';
COMMENT ON TABLE public.pierrot_dev_settings IS
  'Small server-only operational flags such as queue pause.';

-- Manual verification (not executed automatically):
--   SELECT table_name, row_security
--     FROM (VALUES
--       ('pierrot_dev_batches'),('pierrot_dev_batch_items'),
--       ('pierrot_dev_attempts'),('pierrot_dev_events'),
--       ('pierrot_dev_workers'),('pierrot_dev_settings')
--     ) AS t(table_name);
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname LIKE 'pierrot_dev_%';
--   SELECT routine_name, security_type FROM information_schema.routines
--    WHERE routine_schema = 'public' AND routine_name LIKE 'pierrot_dev_%';
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'pierrot_dev_attempts';
