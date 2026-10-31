-- Migration: Media Archive source-based ingestion
-- Date: 2026-11-07
--
-- Media metadata and text indexing are independent: `media_archive_records.status`
-- is the publication state, while `indexing_status` tracks the Brain coverage
-- job. Existing rows are preserved and backfilled from their linked document.

ALTER TABLE public.media_archive_records
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS source_format text NOT NULL DEFAULT 'url',
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS source_sha256 text,
  ADD COLUMN IF NOT EXISTS extraction_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS indexing_status text NOT NULL DEFAULT 'not_indexed',
  ADD COLUMN IF NOT EXISTS indexing_error text;

UPDATE public.media_archive_records
SET source_format = CASE
  WHEN source_format IN ('url', 'pdf', 'txt', 'text') THEN source_format
  ELSE 'url'
END
WHERE source_format IS NULL OR source_format NOT IN ('url', 'pdf', 'txt', 'text');

UPDATE public.media_archive_records m
SET content_hash = d.content_hash,
    source_path = d.source_path,
    source_sha256 = d.source_sha256,
    source_format = CASE
      WHEN d.source_format IN ('url', 'pdf', 'txt', 'text') THEN d.source_format
      ELSE m.source_format
    END,
    indexing_status = CASE
      WHEN d.media_coverage_status IS NULL THEN 'not_indexed'
      WHEN d.media_coverage_status IN ('completed', 'partial', 'failed', 'blocked', 'pending', 'processing')
        THEN d.media_coverage_status
      ELSE 'not_indexed'
    END,
    indexing_error = d.media_coverage_error_detail
FROM public.knowledge_documents d
WHERE d.media_record_id = m.id
  AND (m.content_hash IS NULL OR m.source_path IS NULL OR m.source_sha256 IS NULL);

UPDATE public.media_archive_records m
SET author = COALESCE(m.author, LEFT(d.author, 300)),
    extraction_diagnostics = CASE
      WHEN d.media_coverage_diagnostics = '{}'::jsonb THEN m.extraction_diagnostics
      ELSE d.media_coverage_diagnostics
    END
FROM public.knowledge_documents d
WHERE d.media_record_id = m.id
  AND (m.author IS NULL OR m.extraction_diagnostics = '{}'::jsonb);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_author_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_author_check
      CHECK (author IS NULL OR char_length(author) <= 300);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_source_format_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_source_format_check
      CHECK (source_format IN ('url', 'pdf', 'txt', 'text'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_content_hash_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_content_hash_check
      CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_source_sha256_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_source_sha256_check
      CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_source_path_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_source_path_check
      CHECK (source_path IS NULL OR char_length(source_path) <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_extraction_diagnostics_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_extraction_diagnostics_check
      CHECK (
        jsonb_typeof(extraction_diagnostics) = 'object'
        AND pg_column_size(extraction_diagnostics) <= 8192
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_indexing_status_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_indexing_status_check
      CHECK (indexing_status IN (
        'not_indexed', 'pending', 'processing', 'completed', 'partial', 'failed', 'blocked'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'media_archive_records_indexing_error_check'
      AND conrelid = 'public.media_archive_records'::regclass
  ) THEN
    ALTER TABLE public.media_archive_records
      ADD CONSTRAINT media_archive_records_indexing_error_check
      CHECK (indexing_error IS NULL OR char_length(indexing_error) <= 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS media_archive_records_content_hash_idx
  ON public.media_archive_records (content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_archive_records_source_sha_idx
  ON public.media_archive_records (source_sha256)
  WHERE source_sha256 IS NOT NULL;

-- The unified source loader can store captured HTML as well as PDF/TXT.
ALTER TABLE public.brain_ingestion_jobs
  DROP CONSTRAINT IF EXISTS brain_ingestion_jobs_storage_path_check;

ALTER TABLE public.brain_ingestion_jobs
  ADD CONSTRAINT brain_ingestion_jobs_storage_path_check
  CHECK (
    storage_path IS NULL
    OR (
      char_length(storage_path) <= 1000
      AND storage_path ~ '^brain-sources/[a-f0-9]{2}/[a-f0-9]{64}\.(pdf|txt|html)$'
    )
  );

COMMENT ON COLUMN public.media_archive_records.author IS
  'Author/byline when known. Separate from outlet.';
COMMENT ON COLUMN public.media_archive_records.source_format IS
  'How the indexed text was supplied: url, pdf, txt or text (manual paste).';
COMMENT ON COLUMN public.media_archive_records.content_hash IS
  'SHA-256 of normalized extracted text, matching knowledge_documents.content_hash.';
COMMENT ON COLUMN public.media_archive_records.source_path IS
  'Private source object path, or original URL for legacy rows.';
COMMENT ON COLUMN public.media_archive_records.source_sha256 IS
  'SHA-256 of the captured HTML, PDF, TXT or pasted text bytes.';
COMMENT ON COLUMN public.media_archive_records.extraction_diagnostics IS
  'Preview/extraction quality, truncation, paywall and chunk diagnostics.';
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'text/plain', 'text/markdown', 'text/html']
WHERE id = 'brain-sources';

COMMENT ON COLUMN public.media_archive_records.indexing_status IS
  'Independent Brain indexing state; publication status is media_archive_records.status.';
