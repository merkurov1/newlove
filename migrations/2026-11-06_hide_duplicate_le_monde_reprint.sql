-- Data-only correction for /media.
--
-- The same Le Monde article was published twice:
--   0ce50a84-da0c-48d3-9323-0726de400a09  Le Monde  (canonical)
--   cd42abb0-4789-44a8-8add-8126ec6fdf44  Le Temps  (confirmed reprint)
--
-- The public Media archive must show only the canonical Le Monde record.
-- This is intentionally a soft removal: media_archive_records.status has only
-- draft/published, and knowledge_documents / brain_ingestion_jobs reference the
-- reprint with ON DELETE RESTRICT. Setting status = 'draft' removes the
-- duplicate card without destroying the Brain document, jobs or relation audit.
--
-- Applied manually on 2026-11-06. Safe to re-run: the WHERE clause only touches
-- the duplicate while the canonical record is still published.

UPDATE public.media_archive_records
SET
  status = 'draft',
  ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || jsonb_build_object(
    'duplicate_of', '0ce50a84-da0c-48d3-9323-0726de400a09',
    'hidden_reason', 'duplicate reprint of canonical Le Monde article',
    'hidden_at', NOW()
  )
WHERE id = 'cd42abb0-4789-44a8-8add-8126ec6fdf44'
  AND status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.media_archive_records AS canonical
    WHERE canonical.id = '0ce50a84-da0c-48d3-9323-0726de400a09'
      AND canonical.status = 'published'
  );

-- Verification:
--   SELECT lower(title), count(*)
--   FROM public.media_archive_records
--   WHERE status = 'published'
--     AND title = 'Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie'
--   GROUP BY lower(title);
-- Expected: one published row, outlet = Le Monde.
