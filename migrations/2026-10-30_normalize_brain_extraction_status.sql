-- Migration: normalize legacy Brain extraction status labels
-- Date: 2026-10-30
--
-- The Brain extractor v1 used `ok` for a complete extraction. The v2 contract
-- uses `complete` | `partial` | `failed` | `needs_review`. Historical rows stay
-- readable either way, but normalizing them keeps the admin UI, analytics and
-- future filters consistent.
--
-- This migration is idempotent. It does not delete documents, chunks or jobs.

UPDATE public.knowledge_documents
SET extraction_status = 'complete'
WHERE source_type = 'article'
  AND extraction_status = 'ok';

UPDATE public.brain_ingestion_jobs
SET extraction_status = 'complete'
WHERE extraction_status = 'ok';

COMMENT ON COLUMN public.knowledge_documents.extraction_status IS
  'Article extraction result: complete, partial, failed or needs_review. Legacy ok is normalized to complete.';

COMMENT ON COLUMN public.brain_ingestion_jobs.extraction_status IS
  'Article extraction result: complete, partial, failed or needs_review. Legacy ok is normalized to complete.';
