-- Migration: public-only Brain retrieval for Flow AI context
-- Date: 2026-11-09
--
-- Safety model:
--   * every knowledge document stays owner-only by default;
--   * public Flow retrieval requires an explicit public_retrieval_allowed flag;
--   * manuscripts and private columns can never be flagged;
--   * the public RPC requires an explicit document allowlist;
--   * flow_ai_context stores only public source references.
--
-- This migration does not regenerate any Flow context and does not publish
-- anything. Existing rows keep their current content.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Explicit public retrieval permission on Brain documents
-- ---------------------------------------------------------------------------

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS public_retrieval_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_retrieval_allowed_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_retrieval_allowed_by text,
  ADD COLUMN IF NOT EXISTS public_retrieval_note text
    CHECK (public_retrieval_note IS NULL OR char_length(public_retrieval_note) <= 500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_documents_public_retrieval_safe_check'
      AND conrelid = 'public.knowledge_documents'::regclass
  ) THEN
    ALTER TABLE public.knowledge_documents
      ADD CONSTRAINT knowledge_documents_public_retrieval_safe_check
      CHECK (
        public_retrieval_allowed = false
        OR source_type NOT IN ('manuscript', 'personal_writing')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_documents_public_retrieval_idx
  ON public.knowledge_documents (id)
  WHERE public_retrieval_allowed = true
    AND source_type NOT IN ('manuscript', 'personal_writing');

COMMENT ON COLUMN public.knowledge_documents.public_retrieval_allowed IS
  'Explicit owner approval to use this document in public Flow RAG. Defaults to false.';
COMMENT ON COLUMN public.knowledge_documents.public_retrieval_note IS
  'Short audit note explaining why the document is allowed in public retrieval.';

-- ---------------------------------------------------------------------------
-- 2. Per-item RAG switch
-- ---------------------------------------------------------------------------

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS rag_allowed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.items.rag_allowed IS
  'When false, Flow AI context for this item is generated without Brain RAG.';

-- ---------------------------------------------------------------------------
-- 3. Flow AI context provenance and source references
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.flow_ai_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES public.items(id) ON DELETE CASCADE,
  content text,
  model text,
  provider text NOT NULL DEFAULT 'openrouter',
  status text NOT NULL DEFAULT 'pending',
  error text,
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flow_ai_context
  ADD COLUMN IF NOT EXISTS rag_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retrieval_status text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS retrieval_method text,
  ADD COLUMN IF NOT EXISTS retrieval_latency_ms integer
    CHECK (retrieval_latency_ms IS NULL OR retrieval_latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS source_document_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_titles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retrieval_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_version text NOT NULL DEFAULT 'flow-ai-v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_ai_context_retrieval_status_check'
      AND conrelid = 'public.flow_ai_context'::regclass
  ) THEN
    ALTER TABLE public.flow_ai_context
      ADD CONSTRAINT flow_ai_context_retrieval_status_check
      CHECK (retrieval_status IN (
        'disabled', 'pending', 'no_match', 'weak_match', 'relevant',
        'unavailable', 'error'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_ai_context_source_refs_check'
      AND conrelid = 'public.flow_ai_context'::regclass
  ) THEN
    ALTER TABLE public.flow_ai_context
      ADD CONSTRAINT flow_ai_context_source_refs_check
      CHECK (
        jsonb_typeof(source_refs) = 'array'
        AND pg_column_size(source_refs) <= 32768
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_ai_context_retrieval_diagnostics_check'
      AND conrelid = 'public.flow_ai_context'::regclass
  ) THEN
    ALTER TABLE public.flow_ai_context
      ADD CONSTRAINT flow_ai_context_retrieval_diagnostics_check
      CHECK (
        jsonb_typeof(retrieval_diagnostics) = 'object'
        AND pg_column_size(retrieval_diagnostics) <= 8192
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_ai_context_generation_version_check'
      AND conrelid = 'public.flow_ai_context'::regclass
  ) THEN
    ALTER TABLE public.flow_ai_context
      ADD CONSTRAINT flow_ai_context_generation_version_check
      CHECK (char_length(generation_version) BETWEEN 1 AND 80);
  END IF;
END $$;

ALTER TABLE public.flow_ai_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flow_ai_context FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.flow_ai_context TO service_role;

COMMENT ON COLUMN public.flow_ai_context.source_refs IS
  'Public-only source references: document id, title, chunk id, excerpt, similarity and URL.';
COMMENT ON COLUMN public.flow_ai_context.retrieval_status IS
  'disabled, pending, no_match, weak_match, relevant, unavailable or error.';
COMMENT ON COLUMN public.flow_ai_context.generation_version IS
  'Prompt/retrieval contract version, for example flow-ai-rag-v1.';

-- ---------------------------------------------------------------------------
-- 4. Public-only hybrid retrieval RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.brain_search_flow_public(
  p_query_embedding vector(1024),
  p_model_id TEXT,
  p_dimensions INTEGER,
  p_query_text TEXT DEFAULT NULL,
  p_document_ids TEXT[] DEFAULT NULL,
  p_match_count INTEGER DEFAULT 24,
  p_min_similarity DOUBLE PRECISION DEFAULT -1
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  document_title TEXT,
  source_type TEXT,
  source_domain TEXT,
  author TEXT,
  language TEXT,
  published_at TIMESTAMPTZ,
  content TEXT,
  heading TEXT,
  section_path TEXT[],
  section_index INTEGER,
  line_start INTEGER,
  line_end INTEGER,
  similarity DOUBLE PRECISION,
  lexical_score DOUBLE PRECISION
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

  IF p_match_count IS NULL OR p_match_count < 1 OR p_match_count > 60 THEN
    RAISE EXCEPTION 'invalid_match_count' USING ERRCODE = '22023';
  END IF;

  IF p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'invalid_min_similarity' USING ERRCODE = '22023';
  END IF;

  IF p_query_text IS NOT NULL AND char_length(p_query_text) > 4000 THEN
    RAISE EXCEPTION 'invalid_query_text' USING ERRCODE = '22023';
  END IF;

  -- No allowlist means no public retrieval. This function must never perform
  -- an implicit whole-corpus search.
  IF p_document_ids IS NULL OR array_length(p_document_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      c.id AS chunk_id,
      c.document_id,
      d.title AS document_title,
      d.source_type,
      COALESCE(
        NULLIF(d.metadata->>'source_domain', ''),
        split_part(
          regexp_replace(
            COALESCE(d.canonical_url, d.source_url, d.source_path, ''),
            '^https?://',
            ''
          ),
          '/',
          1
        )
      ) AS source_domain,
      d.author,
      d.language,
      d.published_at,
      c.content,
      c.heading,
      c.section_path,
      c.section_index,
      c.line_start,
      c.line_end,
      1 - (c.embedding <=> p_query_embedding) AS similarity,
      CASE
        WHEN p_query_text IS NULL OR btrim(p_query_text) = '' THEN 0::DOUBLE PRECISION
        ELSE ts_rank_cd(
          to_tsvector('simple', COALESCE(c.heading, '') || ' ' || c.content),
          plainto_tsquery('simple', p_query_text)
        )::DOUBLE PRECISION
      END AS lexical_score
    FROM public.knowledge_chunks c
    JOIN public.knowledge_documents d
      ON d.id = c.document_id
     AND d.embedding_model = c.embedding_model
     AND d.embedding_dimensions = c.embedding_dimensions
    WHERE d.ingestion_status = 'completed'
      AND d.public_retrieval_allowed = true
      AND d.source_type NOT IN ('manuscript', 'personal_writing')
      AND d.access_class IN ('owner', 'public')
      AND c.access_class IN ('owner', 'public')
      AND c.document_id = ANY (p_document_ids)
      AND c.embedding_model = p_model_id
      AND c.embedding_dimensions = p_dimensions
      AND d.embedding_model = p_model_id
      AND d.embedding_dimensions = p_dimensions
  )
  SELECT
    candidates.chunk_id,
    candidates.document_id,
    candidates.document_title,
    candidates.source_type,
    candidates.source_domain,
    candidates.author,
    candidates.language,
    candidates.published_at,
    candidates.content,
    candidates.heading,
    candidates.section_path,
    candidates.section_index,
    candidates.line_start,
    candidates.line_end,
    candidates.similarity,
    candidates.lexical_score
  FROM candidates
  WHERE candidates.similarity >= p_min_similarity
     OR candidates.lexical_score > 0
  ORDER BY
    (0.8 * candidates.similarity + 0.2 * LEAST(1::DOUBLE PRECISION, candidates.lexical_score)) DESC,
    candidates.similarity DESC,
    candidates.chunk_id
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_search_flow_public(
  vector, TEXT, INTEGER, TEXT, TEXT[], INTEGER, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.brain_search_flow_public(
  vector, TEXT, INTEGER, TEXT, TEXT[], INTEGER, DOUBLE PRECISION
) TO service_role;

COMMENT ON FUNCTION public.brain_search_flow_public(
  vector, TEXT, INTEGER, TEXT, TEXT[], INTEGER, DOUBLE PRECISION
) IS
  'Server-only public Flow retrieval. Requires explicit document allowlist and public_retrieval_allowed=true.';
