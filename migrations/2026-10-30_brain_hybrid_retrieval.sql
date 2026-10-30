-- Migration: source-aware hybrid Brain retrieval
-- Date: 2026-10-30
--
-- Adds a second, additive search RPC. The existing
-- knowledge_search_unframed() remains untouched so the old vector-only
-- implementation can still be compared or used as a fallback.
--
-- The new function combines:
--   * BGE-M3 cosine similarity;
--   * Postgres full-text ranking (language-neutral 'simple' configuration);
--   * document/source/author/language/date filters;
--   * document and chunk access checks.

CREATE INDEX IF NOT EXISTS knowledge_chunks_content_fts_idx
  ON public.knowledge_chunks
  USING GIN (to_tsvector('simple', COALESCE(heading, '') || ' ' || content));

CREATE INDEX IF NOT EXISTS knowledge_documents_author_idx
  ON public.knowledge_documents (lower(author));

CREATE INDEX IF NOT EXISTS knowledge_documents_published_at_idx
  ON public.knowledge_documents (published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.brain_search_hybrid(
  p_query_embedding vector(1024),
  p_model_id TEXT,
  p_dimensions INTEGER,
  p_access_class TEXT,
  p_query_text TEXT DEFAULT NULL,
  p_source_types TEXT[] DEFAULT NULL,
  p_source_domains TEXT[] DEFAULT NULL,
  p_authors TEXT[] DEFAULT NULL,
  p_languages TEXT[] DEFAULT NULL,
  p_document_ids TEXT[] DEFAULT NULL,
  p_published_from TIMESTAMPTZ DEFAULT NULL,
  p_published_to TIMESTAMPTZ DEFAULT NULL,
  p_match_count INTEGER DEFAULT 40,
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

  IF p_access_class NOT IN ('public', 'owner') THEN
    RAISE EXCEPTION 'invalid_access_class' USING ERRCODE = '22023';
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
      AND c.access_class = p_access_class
      AND d.access_class = p_access_class
      AND c.embedding_model = p_model_id
      AND c.embedding_dimensions = p_dimensions
      AND d.embedding_model = p_model_id
      AND d.embedding_dimensions = p_dimensions
      AND (p_source_types IS NULL OR d.source_type = ANY (p_source_types))
      AND (p_document_ids IS NULL OR c.document_id = ANY (p_document_ids))
      AND (p_languages IS NULL OR d.language = ANY (p_languages))
      AND (
        p_authors IS NULL
        OR lower(COALESCE(d.author, '')) = ANY (p_authors)
      )
      AND (p_published_from IS NULL OR d.published_at >= p_published_from)
      AND (p_published_to IS NULL OR d.published_at <= p_published_to)
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
  WHERE (p_source_domains IS NULL OR EXISTS (
      SELECT 1
      FROM unnest(p_source_domains) AS allowed_domain
      WHERE candidates.source_domain = allowed_domain
        OR candidates.source_domain LIKE '%.' || allowed_domain
    ))
    AND (candidates.similarity >= p_min_similarity OR candidates.lexical_score > 0)
  ORDER BY
    (0.8 * candidates.similarity + 0.2 * LEAST(1::DOUBLE PRECISION, candidates.lexical_score)) DESC,
    candidates.similarity DESC,
    candidates.chunk_id
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_search_hybrid(
  vector, TEXT, INTEGER, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[],
  TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.brain_search_hybrid(
  vector, TEXT, INTEGER, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[],
  TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, DOUBLE PRECISION
) TO service_role;

COMMENT ON FUNCTION public.brain_search_hybrid(
  vector, TEXT, INTEGER, TEXT, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[],
  TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, DOUBLE PRECISION
) IS
  'Server-only hybrid Brain search: BGE-M3 cosine + simple full-text ranking + source/date filters.';
