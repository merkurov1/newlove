-- Migration: Media Intelligence analysis queue, versioning and entities
-- Date: 2026-11-08
--
-- Turns media_analysis_runs into a durable queue. Runs are claimed with
-- FOR UPDATE SKIP LOCKED, have a lease/heartbeat and bounded retries. The
-- existing analysis tables remain the source of truth for current results;
-- historical runs are never deleted.

ALTER TABLE public.media_analysis_runs
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS requested_by text,
  ADD COLUMN IF NOT EXISTS requested_via text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS force_refresh boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_analysis_runs_attempt_check'
      AND conrelid = 'public.media_analysis_runs'::regclass
  ) THEN
    ALTER TABLE public.media_analysis_runs
      ADD CONSTRAINT media_analysis_runs_attempt_check
      CHECK (attempt >= 0 AND max_attempts BETWEEN 1 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_analysis_runs_requested_via_check'
      AND conrelid = 'public.media_analysis_runs'::regclass
  ) THEN
    ALTER TABLE public.media_analysis_runs
      ADD CONSTRAINT media_analysis_runs_requested_via_check
      CHECK (requested_via IN ('manual', 'selected', 'bulk', 'retry', 'cron', 'scheduler'));
  END IF;
END $$;

-- One active queued/processing run per publication. Completed/failed history is
-- preserved, only concurrent duplicates are prevented.
CREATE UNIQUE INDEX IF NOT EXISTS media_analysis_runs_active_uidx
  ON public.media_analysis_runs (media_record_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS media_analysis_runs_claim_idx
  ON public.media_analysis_runs (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS media_analysis_runs_status_idx
  ON public.media_analysis_runs (status, created_at DESC);

ALTER TABLE public.media_analysis_topics
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE public.media_editorial_roles
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- A repeated analysis must not create a second current copy of the same quote
-- position. Historical rows stay available through analysis_run_id.
CREATE UNIQUE INDEX IF NOT EXISTS media_quotes_current_uidx
  ON public.media_quotes (media_record_id, quote_hash, document_char_start, quote_type)
  WHERE is_current = true;

-- ---------------------------------------------------------------------------
-- Participants and mentioned organizations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_analysis_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL
    REFERENCES public.media_analysis_runs(id) ON DELETE CASCADE,
  media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  document_id text NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('person', 'organization')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  role text CHECK (role IS NULL OR char_length(role) <= 300),
  context text CHECK (context IS NULL OR char_length(context) <= 1000),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500
    CHECK (confidence >= 0 AND confidence <= 1),
  is_current boolean NOT NULL DEFAULT true,
  superseded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_analysis_entities
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS media_analysis_entities_run_uidx
  ON public.media_analysis_entities (analysis_run_id, entity_type, lower(name));

CREATE INDEX IF NOT EXISTS media_analysis_entities_current_idx
  ON public.media_analysis_entities (media_record_id, is_current, entity_type);

CREATE INDEX IF NOT EXISTS media_analysis_entities_name_idx
  ON public.media_analysis_entities (lower(name))
  WHERE is_current = true;

ALTER TABLE public.media_analysis_entities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.media_analysis_entities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_analysis_entities TO service_role;

COMMENT ON TABLE public.media_analysis_entities IS
  'Owner-only participants and organizations mentioned in a media publication.';
COMMENT ON COLUMN public.media_analysis_runs.requested_via IS
  'Who enqueued the run: manual, selected, bulk, retry, cron or scheduler.';
COMMENT ON COLUMN public.media_analysis_runs.lease_expires_at IS
  'Worker lease; expired processing runs are recovered by media_claim_next_analysis_run.';

-- ---------------------------------------------------------------------------
-- Atomic queue claim with stale-lease recovery
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.media_claim_next_analysis_run(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 900
)
RETURNS SETOF public.media_analysis_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease integer := GREATEST(60, LEAST(3600, COALESCE(p_lease_seconds, 900)));
BEGIN
  -- Expired leases: retry with bounded attempts or fail permanently.
  UPDATE public.media_analysis_runs r
  SET status = CASE WHEN r.attempt >= r.max_attempts THEN 'failed' ELSE 'pending' END,
      error_code = CASE
        WHEN r.attempt >= r.max_attempts THEN 'media_analysis_lease_expired'
        ELSE r.error_code
      END,
      error_detail = CASE
        WHEN r.attempt >= r.max_attempts THEN 'Worker lease expired; retry budget exhausted.'
        ELSE r.error_detail
      END,
      retry_after = CASE
        WHEN r.attempt >= r.max_attempts THEN NULL
        ELSE now() + make_interval(
          secs => LEAST(300, 30 * GREATEST(1, r.attempt) * 2)
        )
      END,
      lease_expires_at = NULL,
      worker_id = NULL,
      completed_at = CASE WHEN r.attempt >= r.max_attempts THEN now() ELSE NULL END,
      updated_at = now()
  WHERE r.status = 'processing'
    AND r.lease_expires_at IS NOT NULL
    AND r.lease_expires_at < now();

  RETURN QUERY
  WITH candidate AS (
    SELECT r.id
    FROM public.media_analysis_runs r
    WHERE r.status = 'pending'
      AND (r.retry_after IS NULL OR r.retry_after <= now())
    ORDER BY r.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.media_analysis_runs r
  SET status = 'processing',
      attempt = r.attempt + 1,
      worker_id = p_worker_id,
      started_at = COALESCE(r.started_at, now()),
      lease_expires_at = now() + make_interval(secs => v_lease),
      retry_after = NULL,
      error_code = NULL,
      error_detail = NULL,
      updated_at = now()
  FROM candidate c
  WHERE r.id = c.id
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.media_claim_next_analysis_run(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_claim_next_analysis_run(text, integer)
  TO service_role;

COMMENT ON FUNCTION public.media_claim_next_analysis_run(text, integer) IS
  'Atomically claims one queued media analysis run and recovers expired leases.';
