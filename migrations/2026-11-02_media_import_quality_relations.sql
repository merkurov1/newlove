-- Migration: Media import quality levels and reprint relations
-- Date: 2026-11-02
--
-- Adds explicit text quality to media coverage documents and a small
-- owner-only relation table for reprints/syndication. Neither table is
-- publicly readable; media_archive_records remains the bibliographic source
-- of truth and the public /media page keeps its existing query.

-- ---------------------------------------------------------------------------
-- 1. Explicit extraction quality for media coverage
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS media_text_quality text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_text_quality_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_text_quality_check
      CHECK (
        media_text_quality IS NULL
        OR media_text_quality IN (
          'full_text',
          'partial_text',
          'metadata_only',
          'blocked'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_documents_media_text_quality_requires_record'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_media_text_quality_requires_record
      CHECK (
        media_text_quality IS NULL
        OR media_record_id IS NOT NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_documents_media_quality_idx
  ON public.knowledge_documents (media_text_quality, media_coverage_status)
  WHERE media_record_id IS NOT NULL;

COMMENT ON COLUMN public.knowledge_documents.media_text_quality IS
  'full_text, partial_text, metadata_only or blocked. Describes the currently indexed text, not only the latest attempt.';

-- ---------------------------------------------------------------------------
-- 2. Reprint / syndication relations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_record_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  target_media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  relation_type text NOT NULL
    CHECK (relation_type IN ('reprint', 'syndication', 'related')),
  confidence numeric(4,3) NOT NULL DEFAULT 1.000
    CHECK (confidence >= 0 AND confidence <= 1),
  detected_by text NOT NULL
    CHECK (char_length(detected_by) BETWEEN 1 AND 80),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_media_record_id <> target_media_record_id),
  UNIQUE (source_media_record_id, target_media_record_id, relation_type)
);

CREATE INDEX IF NOT EXISTS media_record_relations_source_idx
  ON public.media_record_relations (source_media_record_id, relation_type);

CREATE INDEX IF NOT EXISTS media_record_relations_target_idx
  ON public.media_record_relations (target_media_record_id, relation_type);

ALTER TABLE public.media_record_relations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.media_record_relations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_record_relations TO service_role;

COMMENT ON TABLE public.media_record_relations IS
  'Owner-only reprint/syndication relations between Media Archive records. Records are never deleted or merged automatically.';

COMMENT ON COLUMN public.media_record_relations.detected_by IS
  'Detection source, e.g. content_hash, canonical_url or manual.';
