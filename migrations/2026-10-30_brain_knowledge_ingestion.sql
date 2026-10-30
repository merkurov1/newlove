-- Migration: Brain knowledge base + durable URL ingestion queue
-- Date: 2026-10-30
--
-- Adds metadata columns to the existing knowledge_* tables (no second RAG
-- system), a durable queue for bulk URL ingestion, and extends the existing
-- owner-scoped search RPC so it can search the whole Brain instead of only the
-- UNFRAMED manuscript. Public/anon access stays closed.
--
-- The migration is idempotent and safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Document provenance columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS ingestion_version text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manuscript',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS normalized_url text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS ingestion_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_source_type_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_source_type_check
      CHECK (char_length(source_type) BETWEEN 1 AND 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_content_hash_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_content_hash_check
      CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_source_url_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_source_url_check
      CHECK (source_url IS NULL OR char_length(source_url) <= 2048);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_canonical_url_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_canonical_url_check
      CHECK (canonical_url IS NULL OR char_length(canonical_url) <= 2048);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_normalized_url_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_normalized_url_check
      CHECK (normalized_url IS NULL OR char_length(normalized_url) <= 2048);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_documents_source_type_idx
  ON public.knowledge_documents (source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_documents_normalized_url_idx
  ON public.knowledge_documents (normalized_url)
  WHERE normalized_url IS NOT NULL;

-- Deduplication at the database level. Partial indexes leave manuscript and
-- legacy rows untouched.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_article_canonical_uidx
  ON public.knowledge_documents (canonical_url)
  WHERE source_type = 'article' AND canonical_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_article_normalized_uidx
  ON public.knowledge_documents (normalized_url)
  WHERE source_type = 'article' AND normalized_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_article_content_uidx
  ON public.knowledge_documents (content_hash)
  WHERE source_type = 'article' AND content_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Durable ingestion runs and jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brain_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.brain_ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.brain_ingestion_runs(id) ON DELETE CASCADE,
  input_url text NOT NULL CHECK (char_length(input_url) BETWEEN 1 AND 4000),
  normalized_url text NOT NULL CHECK (char_length(normalized_url) BETWEEN 1 AND 2048),
  canonical_url text CHECK (canonical_url IS NULL OR char_length(canonical_url) <= 2048),
  final_url text CHECK (final_url IS NULL OR char_length(final_url) <= 2048),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'duplicate', 'partial', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  retry_after timestamptz,
  document_id text,
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  title text CHECK (title IS NULL OR char_length(title) <= 500),
  language text,
  error_code text,
  error_detail text,
  extraction_status text,
  extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(extraction_metadata) = 'object' AND pg_column_size(extraction_metadata) <= 8192),
  worker_id text,
  locked_at timestamptz,
  started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, normalized_url)
);

CREATE INDEX IF NOT EXISTS brain_ingestion_jobs_run_status_idx
  ON public.brain_ingestion_jobs (run_id, status, created_at);

CREATE INDEX IF NOT EXISTS brain_ingestion_jobs_claim_idx
  ON public.brain_ingestion_jobs (status, retry_after, created_at)
  WHERE status = 'queued';

ALTER TABLE public.brain_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_ingestion_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brain_ingestion_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_ingestion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_ingestion_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brain_ingestion_jobs TO service_role;

-- Atomically claim one queued job. FOR UPDATE SKIP LOCKED prevents two workers
-- or two browser tabs from processing the same article.
CREATE OR REPLACE FUNCTION public.brain_claim_next_job(
  p_run_id uuid,
  p_worker text
)
RETURNS SETOF public.brain_ingestion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT id INTO v_job_id
  FROM public.brain_ingestion_jobs
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
  UPDATE public.brain_ingestion_jobs j
  SET status = 'processing',
      worker_id = p_worker,
      locked_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = v_job_id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_claim_next_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_claim_next_job(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Extend the existing owner search RPC to cover the whole Brain
-- ---------------------------------------------------------------------------
--
-- A NULL p_document_id means "all owner documents". Existing callers that pass
-- 'doc_unframed_manuscript' keep exactly the previous behaviour.

CREATE OR REPLACE FUNCTION public.knowledge_search_unframed(
  p_query_embedding vector(1024),
  p_model_id TEXT,
  p_dimensions INTEGER,
  p_access_class TEXT,
  p_document_id TEXT DEFAULT 'doc_unframed_manuscript',
  p_match_count INTEGER DEFAULT 5,
  p_min_similarity DOUBLE PRECISION DEFAULT -1
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  content TEXT,
  heading TEXT,
  section_path TEXT[],
  section_index INTEGER,
  line_start INTEGER,
  line_end INTEGER,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_model_id IS NULL OR p_model_id = '' OR char_length(p_model_id) > 100 THEN
    RAISE EXCEPTION 'invalid_model_id' USING ERRCODE = '22023';
  END IF;

  IF p_dimensions IS NULL OR p_dimensions <> 1024 THEN
    RAISE EXCEPTION 'invalid_dimensions' USING ERRCODE = '22023';
  END IF;

  IF p_access_class NOT IN ('public', 'owner') THEN
    RAISE EXCEPTION 'invalid_access_class' USING ERRCODE = '22023';
  END IF;

  IF p_document_id IS NOT NULL
     AND (p_document_id = '' OR char_length(p_document_id) > 64) THEN
    RAISE EXCEPTION 'invalid_document_id' USING ERRCODE = '22023';
  END IF;

  IF p_match_count IS NULL OR p_match_count < 1 OR p_match_count > 10 THEN
    RAISE EXCEPTION 'invalid_match_count' USING ERRCODE = '22023';
  END IF;

  IF p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'invalid_min_similarity' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.heading,
    c.section_path,
    c.section_index,
    c.line_start,
    c.line_end,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d
    ON d.id = c.document_id
   AND d.embedding_model = c.embedding_model
   AND d.embedding_dimensions = c.embedding_dimensions
  WHERE (p_document_id IS NULL OR c.document_id = p_document_id)
    AND d.ingestion_status = 'completed'
    AND c.access_class = p_access_class
    AND d.access_class = p_access_class
    AND c.embedding_model = p_model_id
    AND c.embedding_dimensions = p_dimensions
    AND d.embedding_model = p_model_id
    AND d.embedding_dimensions = p_dimensions
    AND 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_search_unframed(
  vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.knowledge_search_unframed(
  vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, DOUBLE PRECISION
) TO service_role;

COMMENT ON TABLE public.brain_ingestion_runs IS
  'Owner-only durable runs for bulk URL ingestion into the Brain knowledge base.';
COMMENT ON TABLE public.brain_ingestion_jobs IS
  'Owner-only per-article ingestion jobs. Claimed atomically; safe to resume.';
COMMENT ON COLUMN public.knowledge_documents.source_type IS
  'manuscript for UNFRAMED, article for URL-ingested columns, extensible for other sources.';
COMMENT ON COLUMN public.knowledge_documents.normalized_url IS
  'Tracking-stripped, scheme-normalized source URL used for duplicate prevention.';
COMMENT ON COLUMN public.knowledge_documents.canonical_url IS
  'Canonical URL declared by the page, normalized. Unique for source_type=article.';
COMMENT ON COLUMN public.knowledge_documents.content_hash IS
  'SHA-256 of extracted article text. Unique for source_type=article.';
