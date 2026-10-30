-- Migration: backfill verified Novaya Gazeta publication dates
-- Date: 2026-10-30
--
-- Older Brain article rows were ingested before publication-date recovery.
-- Their canonical URLs already contain a /YYYY/MM/DD/ path. This migration
-- fills published_at only when that path represents a real calendar date.
-- It never overwrites an existing value and never invents a date for another
-- domain.

DO $$
DECLARE
  row_record RECORD;
  date_parts TEXT[];
  parsed_date DATE;
BEGIN
  FOR row_record IN
    SELECT id, canonical_url
    FROM public.knowledge_documents
    WHERE source_type = 'article'
      AND published_at IS NULL
      AND canonical_url ~ '^https://(www\.)?novayagazeta\.(ru|eu)/articles/[0-9]{4}/[0-9]{2}/[0-9]{2}(/|$)'
  LOOP
    date_parts := regexp_match(
      row_record.canonical_url,
      '/articles/([0-9]{4})/([0-9]{2})/([0-9]{2})(/|$)'
    );

    IF date_parts IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      parsed_date := make_date(
        date_parts[1]::INTEGER,
        date_parts[2]::INTEGER,
        date_parts[3]::INTEGER
      );
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    UPDATE public.knowledge_documents
    SET published_at = parsed_date::TIMESTAMPTZ,
        updated_at = NOW()
    WHERE id = row_record.id
      AND published_at IS NULL;
  END LOOP;
END $$;
