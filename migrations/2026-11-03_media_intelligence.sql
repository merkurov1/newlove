-- Migration: Media Intelligence analysis layer
-- Date: 2026-11-03
--
-- Stores structured, versioned analysis derived from the existing
-- knowledge_chunks. It does not create a second full-text index and does not
-- duplicate article text. Every quote keeps document/chunk provenance.
--
-- All tables are owner-only. The public /media page is unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Analysis runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  document_id text NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  content_hash text,
  analyzer_version text NOT NULL
    CHECK (char_length(analyzer_version) BETWEEN 1 AND 80),
  model text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  quote_count integer NOT NULL DEFAULT 0 CHECK (quote_count >= 0),
  relation_count integer NOT NULL DEFAULT 0 CHECK (relation_count >= 0),
  topic_count integer NOT NULL DEFAULT 0 CHECK (topic_count >= 0),
  rejected_candidate_count integer NOT NULL DEFAULT 0
    CHECK (rejected_candidate_count >= 0),
  error_code text,
  error_detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_analysis_runs_record_idx
  ON public.media_analysis_runs (media_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS media_analysis_runs_document_idx
  ON public.media_analysis_runs (document_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Quotes, paraphrases and mentions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_quotes (
  id text PRIMARY KEY CHECK (id ~ '^mq_[a-f0-9]{32}$'),
  analysis_run_id uuid NOT NULL
    REFERENCES public.media_analysis_runs(id) ON DELETE CASCADE,
  media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  document_id text NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_id text
    REFERENCES public.knowledge_chunks(id) ON DELETE SET NULL,
  end_chunk_id text
    REFERENCES public.knowledge_chunks(id) ON DELETE SET NULL,
  source_content_hash text NOT NULL
    CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
  quote_text text NOT NULL
    CHECK (char_length(quote_text) BETWEEN 1 AND 4000),
  normalized_text text NOT NULL
    CHECK (char_length(normalized_text) BETWEEN 1 AND 4000),
  quote_hash text NOT NULL
    CHECK (quote_hash ~ '^[a-f0-9]{64}$'),
  language text,
  quote_type text NOT NULL
    CHECK (quote_type IN ('direct_quote', 'indirect_quote', 'mention')),
  context_before text NOT NULL DEFAULT ''
    CHECK (char_length(context_before) <= 1000),
  context_after text NOT NULL DEFAULT ''
    CHECK (char_length(context_after) <= 1000),
  document_char_start integer NOT NULL CHECK (document_char_start >= 0),
  document_char_end integer NOT NULL CHECK (document_char_end > document_char_start),
  chunk_char_start integer CHECK (chunk_char_start IS NULL OR chunk_char_start >= 0),
  chunk_char_end integer CHECK (chunk_char_end IS NULL OR chunk_char_end >= 0),
  attribution text NOT NULL DEFAULT 'unknown'
    CHECK (attribution IN ('anton_merkurov', 'other', 'unknown')),
  attribution_confidence numeric(4,3) NOT NULL DEFAULT 0.500
    CHECK (attribution_confidence >= 0 AND attribution_confidence <= 1),
  attribution_note text
    CHECK (attribution_note IS NULL OR char_length(attribution_note) <= 1000),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500
    CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN (
      'unverified', 'needs_review', 'verified', 'rejected', 'superseded'
    )),
  translation text
    CHECK (translation IS NULL OR char_length(translation) <= 4000),
  translation_language text,
  translation_status text NOT NULL DEFAULT 'none'
    CHECK (translation_status IN ('none', 'draft', 'verified', 'rejected')),
  is_current boolean NOT NULL DEFAULT true,
  superseded_by_quote_id text,
  reviewed_by text,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id, quote_hash, document_char_start)
);

CREATE INDEX IF NOT EXISTS media_quotes_record_current_idx
  ON public.media_quotes (media_record_id, is_current, verification_status);

CREATE INDEX IF NOT EXISTS media_quotes_document_hash_idx
  ON public.media_quotes (document_id, quote_hash);

CREATE INDEX IF NOT EXISTS media_quotes_current_hash_idx
  ON public.media_quotes (quote_hash)
  WHERE is_current = true;

-- ---------------------------------------------------------------------------
-- 3. Topics and editorial role
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_analysis_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL
    REFERENCES public.media_analysis_runs(id) ON DELETE CASCADE,
  media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  document_id text NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  primary_topic text NOT NULL
    CHECK (primary_topic IN (
      'Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'
    )),
  subtopics text[] NOT NULL DEFAULT '{}'::text[],
  confidence numeric(4,3) NOT NULL DEFAULT 0.600
    CHECK (confidence >= 0 AND confidence <= 1),
  method text NOT NULL DEFAULT 'model',
  is_current boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id, primary_topic)
);

CREATE INDEX IF NOT EXISTS media_analysis_topics_current_idx
  ON public.media_analysis_topics (media_record_id, is_current);

CREATE TABLE IF NOT EXISTS public.media_editorial_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL
    REFERENCES public.media_analysis_runs(id) ON DELETE CASCADE,
  media_record_id uuid NOT NULL
    REFERENCES public.media_archive_records(id) ON DELETE CASCADE,
  document_id text NOT NULL
    REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN (
      'expert_comment', 'interview', 'quoted_expert', 'profile',
      'author', 'mention', 'republication', 'unknown'
    )),
  confidence numeric(4,3) NOT NULL DEFAULT 0.500
    CHECK (confidence >= 0 AND confidence <= 1),
  evidence text
    CHECK (evidence IS NULL OR char_length(evidence) <= 2000),
  is_current boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id)
);

CREATE INDEX IF NOT EXISTS media_editorial_roles_current_idx
  ON public.media_editorial_roles (media_record_id, is_current);

-- ---------------------------------------------------------------------------
-- 4. Extend existing relations for versioning and review
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_record_relations
  ADD COLUMN IF NOT EXISTS analysis_run_id uuid
    REFERENCES public.media_analysis_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unverified'
    CHECK (review_status IN ('unverified', 'needs_review', 'confirmed', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

DO $$
DECLARE
  constraint_name text;
  constraint_def text;
BEGIN
  -- The original unique constraint prevents keeping historical relation
  -- versions. Replace it with a partial unique index over current rows.
  FOR constraint_name, constraint_def IN
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.media_record_relations'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.media_record_relations DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_record_relations_relation_type_check'
      AND conrelid = 'public.media_record_relations'::regclass
  ) THEN
    ALTER TABLE public.media_record_relations
      DROP CONSTRAINT media_record_relations_relation_type_check;
  END IF;

  ALTER TABLE public.media_record_relations
    ADD CONSTRAINT media_record_relations_relation_type_check
    CHECK (relation_type IN (
      'reprint',
      'syndication',
      'related',
      'same_story',
      'shared_quote',
      'same_topic',
      'story_continuation'
    ));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS media_record_relations_current_uidx
  ON public.media_record_relations (
    source_media_record_id,
    target_media_record_id,
    relation_type
  )
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS media_record_relations_current_source_idx
  ON public.media_record_relations (source_media_record_id, is_current, relation_type);

-- ---------------------------------------------------------------------------
-- 5. Access control
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_analysis_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_editorial_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.media_analysis_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.media_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.media_analysis_topics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.media_editorial_roles FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_analysis_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_quotes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_analysis_topics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_editorial_roles TO service_role;

COMMENT ON TABLE public.media_analysis_runs IS
  'Versioned Media Intelligence runs over existing knowledge documents/chunks.';
COMMENT ON TABLE public.media_quotes IS
  'Owner-only quotes/paraphrases/mentions with exact document/chunk provenance.';
COMMENT ON TABLE public.media_analysis_topics IS
  'Derived topics/subtopics; media_archive_records.topic remains the primary editorial classification.';
COMMENT ON TABLE public.media_editorial_roles IS
  'Inferred editorial role with evidence; unknown is used when text is insufficient.';
COMMENT ON COLUMN public.media_quotes.verification_status IS
  'All model output is unverified/needs_review until an owner confirms it.';
COMMENT ON COLUMN public.media_quotes.translation IS
  'Optional translation stored separately from the original quote_text.';
