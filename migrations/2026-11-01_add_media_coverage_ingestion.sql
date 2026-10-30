-- Migration: Media Archive -> Knowledge ingestion integration
-- Date: 2026-11-01
--
-- Adds the first Media Intelligence link without creating a second RAG
-- pipeline. media_archive_records remains the bibliographic source of truth;
-- knowledge_documents / knowledge_chunks remain the only full-text RAG store.
--
-- The migration is additive and idempotent. It does not modify existing rows,
-- existing article/manuscript documents, or the public /media page.
--
-- Security model:
--   * knowledge_documents / knowledge_chunks keep their existing RLS and grants;
--   * media_archive_records keeps its existing published-only public read policy;
--   * media coverage full text remains owner-only through the existing
--     service-role-only knowledge tables.

-- ---------------------------------------------------------------------------
-- 1. Link knowledge_documents to media_archive_records
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS media_record_id uuid,
  ADD COLUMN IF NOT EXISTS media_outlet text,
  ADD COLUMN IF NOT EXISTS media_kind text,
  ADD COLUMN IF NOT EXISTS media_topic text,
  ADD COLUMN IF NOT EXISTS media_language text,
  ADD COLUMN IF NOT EXISTS media_published_date date,
  ADD COLUMN IF NOT EXISTS media_archive_status text,
  ADD COLUMN IF NOT EXISTS media_coverage_status text,
  ADD COLUMN IF NOT EXISTS media_coverage_method text,
  ADD COLUMN IF NOT EXISTS media_coverage_error_code text,
  ADD COLUMN IF NOT EXISTS media_coverage_error_detail text,
  ADD COLUMN IF NOT EXISTS media_coverage_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_record_id_fkey'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_record_id_fkey
      FOREIGN KEY (media_record_id)
      REFERENCES public.media_archive_records(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_record_source_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_record_source_check
      CHECK (
        media_record_id IS NULL
        OR source_type IN ('article', 'media_coverage')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_coverage_requires_record'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_coverage_requires_record
      CHECK (
        source_type <> 'media_coverage'
        OR media_record_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_status_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_status_check
      CHECK (
        media_coverage_status IS NULL
        OR media_coverage_status IN (
          'pending',
          'processing',
          'completed',
          'failed',
          'partial',
          'blocked'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_status_requires_record'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_status_requires_record
      CHECK (
        media_coverage_status IS NULL
        OR media_record_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_completed_has_chunks'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_completed_has_chunks
      CHECK (
        media_coverage_status IS DISTINCT FROM 'completed'
        OR chunk_count > 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_published_date_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_published_date_check
      CHECK (
        media_published_date IS NULL
        OR media_record_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_outlet_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_outlet_check
      CHECK (media_outlet IS NULL OR char_length(media_outlet) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_kind_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_kind_check
      CHECK (media_kind IS NULL OR char_length(media_kind) <= 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_topic_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_topic_check
      CHECK (media_topic IS NULL OR char_length(media_topic) <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_language_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_language_check
      CHECK (media_language IS NULL OR char_length(media_language) <= 16);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_archive_status_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_archive_status_check
      CHECK (media_archive_status IS NULL OR char_length(media_archive_status) <= 40);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_method_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_method_check
      CHECK (media_coverage_method IS NULL OR char_length(media_coverage_method) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_error_code_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_error_code_check
      CHECK (media_coverage_error_code IS NULL OR char_length(media_coverage_error_code) <= 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_error_detail_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_error_detail_check
      CHECK (
        media_coverage_error_detail IS NULL
        OR char_length(media_coverage_error_detail) <= 1000
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_diagnostics_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_diagnostics_check
      CHECK (
        jsonb_typeof(media_coverage_diagnostics) = 'object'
        AND pg_column_size(media_coverage_diagnostics) <= 8192
      );
  END IF;
END $$;

-- One media archive record maps to at most one knowledge document. This is the
-- stable identity used for re-processing and for excluding duplicate coverage.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_media_record_uidx
  ON public.knowledge_documents (media_record_id)
  WHERE media_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_documents_media_status_idx
  ON public.knowledge_documents (media_record_id, media_coverage_status, ingestion_status);

CREATE INDEX IF NOT EXISTS knowledge_documents_media_outlet_idx
  ON public.knowledge_documents (media_outlet, media_published_date DESC)
  WHERE media_record_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Allow the existing durable queue to carry media coverage jobs
-- ---------------------------------------------------------------------------

ALTER TABLE public.brain_ingestion_jobs
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS media_record_id uuid,
  ADD COLUMN IF NOT EXISTS requested_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_source_type_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_source_type_check
      CHECK (source_type IN ('article', 'media_coverage'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_media_record_id_fkey'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_media_record_id_fkey
      FOREIGN KEY (media_record_id)
      REFERENCES public.media_archive_records(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_media_requires_record'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_media_requires_record
      CHECK (
        source_type <> 'media_coverage'
        OR media_record_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_requested_by_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_requested_by_check
      CHECK (requested_by IS NULL OR char_length(requested_by) <= 200);
  END IF;
END $$;

-- Only one active media coverage job per archive record. Completed/failed jobs
-- are kept as history; a new re-check can be queued after they finish.
CREATE UNIQUE INDEX IF NOT EXISTS brain_ingestion_jobs_active_media_uidx
  ON public.brain_ingestion_jobs (media_record_id)
  WHERE media_record_id IS NOT NULL
    AND status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS brain_ingestion_jobs_media_status_idx
  ON public.brain_ingestion_jobs (media_record_id, status, created_at DESC)
  WHERE media_record_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Documentation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.knowledge_documents.media_record_id IS
  'Stable link to media_archive_records.id for source_type=media_coverage.';

COMMENT ON COLUMN public.knowledge_documents.media_coverage_status IS
  'Latest Media coverage extraction state: pending, processing, completed, failed, partial, blocked.';

COMMENT ON COLUMN public.knowledge_documents.media_coverage_method IS
  'Extraction method/version used for the indexed full text.';

COMMENT ON COLUMN public.knowledge_documents.media_coverage_diagnostics IS
  'Owner-only extraction diagnostics. Never exposed by public APIs.';

COMMENT ON COLUMN public.brain_ingestion_jobs.source_type IS
  'article for URL-ingested columns; media_coverage for Media Archive coverage.';

COMMENT ON COLUMN public.brain_ingestion_jobs.media_record_id IS
  'Media Archive record processed by this job. Required for media_coverage.';
