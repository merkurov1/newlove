-- Migration: unified Brain source ingestion (URL, PDF, TXT, pasted text)
-- Date: 2026-11-05
--
-- Additive and idempotent. The existing knowledge_documents / knowledge_chunks
-- tables remain the only RAG store. No table is recreated and no document or
-- chunk is rewritten. The original uploaded/pasted text is stored in the
-- private `brain-sources` Supabase Storage bucket, never in JSONB or job
-- payloads.

-- ---------------------------------------------------------------------------
-- 1. Document source metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS source_format text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS page_count integer;

UPDATE public.knowledge_documents
SET source_format = CASE
  WHEN source_type = 'manuscript' THEN 'markdown'
  WHEN source_type IN ('pdf', 'txt', 'text') THEN source_type
  ELSE 'url'
END
WHERE source_format IS NULL;

ALTER TABLE public.knowledge_documents
  ALTER COLUMN source_format SET DEFAULT 'url';

ALTER TABLE public.knowledge_documents
  ALTER COLUMN source_format SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_source_format_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_source_format_check
      CHECK (source_format IN ('url', 'pdf', 'txt', 'text', 'markdown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_original_filename_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_original_filename_check
      CHECK (original_filename IS NULL OR char_length(original_filename) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_mime_type_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_mime_type_check
      CHECK (mime_type IS NULL OR char_length(mime_type) <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_page_count_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_page_count_check
      CHECK (page_count IS NULL OR page_count >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_source_type_values_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_source_type_values_check
      CHECK (source_type IN ('manuscript', 'article', 'media_coverage', 'pdf', 'txt', 'text'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_documents_source_sha_idx
  ON public.knowledge_documents (source_sha256)
  WHERE source_sha256 IS NOT NULL;

-- File/text originals are deduplicated by the SHA-256 of the original bytes.
-- Article and manuscript rows keep their existing semantics.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_file_source_uidx
  ON public.knowledge_documents (source_sha256)
  WHERE source_type IN ('pdf', 'txt', 'text')
    AND source_sha256 IS NOT NULL;

COMMENT ON COLUMN public.knowledge_documents.source_format IS
  'url, pdf, txt, text or markdown. Describes how the original was delivered.';
COMMENT ON COLUMN public.knowledge_documents.original_filename IS
  'Original upload filename only. The source path is a private storage object.';
COMMENT ON COLUMN public.knowledge_documents.page_count IS
  'Source page count for PDFs; NULL for other formats.';

-- ---------------------------------------------------------------------------
-- 2. Durable queue source metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.brain_ingestion_jobs
  ADD COLUMN IF NOT EXISTS source_format text NOT NULL DEFAULT 'url',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS source_sha256 text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS byte_size bigint,
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS title_override text,
  ADD COLUMN IF NOT EXISTS author_override text,
  ADD COLUMN IF NOT EXISTS published_at_override timestamptz,
  ADD COLUMN IF NOT EXISTS language_override text;

ALTER TABLE public.brain_ingestion_jobs
  DROP CONSTRAINT IF EXISTS brain_ingestion_jobs_source_type_check;

ALTER TABLE public.brain_ingestion_jobs
  ADD CONSTRAINT brain_ingestion_jobs_source_type_check
  CHECK (source_type IN ('article', 'media_coverage', 'pdf', 'txt', 'text'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_source_format_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_source_format_check
      CHECK (source_format IN ('url', 'pdf', 'txt', 'text'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_storage_path_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_storage_path_check
      CHECK (
        storage_path IS NULL
        OR (
          char_length(storage_path) <= 1000
          AND storage_path ~ '^brain-sources/[a-f0-9]{2}/[a-f0-9]{64}\.(pdf|txt)$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_source_sha256_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_source_sha256_check
      CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_original_filename_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_original_filename_check
      CHECK (original_filename IS NULL OR char_length(original_filename) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_mime_type_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_mime_type_check
      CHECK (mime_type IS NULL OR char_length(mime_type) <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_byte_size_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_byte_size_check
      CHECK (byte_size IS NULL OR byte_size >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_page_count_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_page_count_check
      CHECK (page_count IS NULL OR page_count >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_title_override_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_title_override_check
      CHECK (title_override IS NULL OR char_length(title_override) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_author_override_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_author_override_check
      CHECK (author_override IS NULL OR char_length(author_override) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_ingestion_jobs_language_override_check'
      AND conrelid = 'public.brain_ingestion_jobs'::regclass
  ) THEN
    ALTER TABLE public.brain_ingestion_jobs
      ADD CONSTRAINT brain_ingestion_jobs_language_override_check
      CHECK (language_override IS NULL OR char_length(language_override) <= 16);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS brain_ingestion_jobs_source_sha_idx
  ON public.brain_ingestion_jobs (source_sha256)
  WHERE source_sha256 IS NOT NULL;

COMMENT ON COLUMN public.brain_ingestion_jobs.source_format IS
  'url, pdf, txt or text. source_type describes the document; source_format describes delivery.';
COMMENT ON COLUMN public.brain_ingestion_jobs.storage_path IS
  'Private brain-sources object path. Required for pdf/txt/text jobs.';
COMMENT ON COLUMN public.brain_ingestion_jobs.source_sha256 IS
  'SHA-256 of the original file or pasted UTF-8 bytes, used for duplicate detection.';

-- ---------------------------------------------------------------------------
-- 3. Private source bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brain-sources',
  'brain-sources',
  false,
  26214400,
  ARRAY['application/pdf', 'text/plain', 'text/markdown', 'text/html']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'text/plain', 'text/markdown', 'text/html']
WHERE id = 'brain-sources';

COMMENT ON COLUMN public.brain_ingestion_jobs.original_filename IS
  'Display-only original filename. Never public and never used as a storage key.';
