-- Migration: media-only semantic search over existing knowledge chunks
-- Date: 2026-11-04
--
-- Uses the existing knowledge_chunks embeddings. It does not create a second
-- full-text index, a second embedding table, or a second ingestion pipeline.
-- The function is owner-only and filters to media coverage documents.

CREATE OR REPLACE FUNCTION public.media_search(
  p_query_embedding vector(1024),
  p_model_id TEXT,
  p_dimensions INTEGER,
  p_access_class TEXT,
  p_match_count INTEGER DEFAULT 12,
  p_min_similarity DOUBLE PRECISION DEFAULT -1,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_topics TEXT[] DEFAULT NULL,
  p_languages TEXT[] DEFAULT NULL,
  p_outlets TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  media_record_id UUID,
  title TEXT,
  outlet TEXT,
  canonical_url TEXT,
  published_date DATE,
  language TEXT,
  content TEXT,
  heading TEXT,
  section_path TEXT[],
  similarity DOUBLE PRECISION,
  text_quality TEXT,
  topic TEXT
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

  IF p_match_count IS NULL OR p_match_count < 1 OR p_match_count > 30 THEN
    RAISE EXCEPTION 'invalid_match_count' USING ERRCODE = '22023';
  END IF;

  IF p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'invalid_min_similarity' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    d.id AS document_id,
    d.media_record_id,
    m.title,
    m.outlet,
    m.canonical_url,
    COALESCE(m.published_date, d.published_at::date) AS published_date,
    COALESCE(NULLIF(d.language, ''), NULLIF(m.lang, '')) AS language,
    c.content,
    c.heading,
    c.section_path,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    d.media_text_quality AS text_quality,
    COALESCE(t.primary_topic, m.topic) AS topic
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d
    ON d.id = c.document_id
   AND d.embedding_model = c.embedding_model
   AND d.embedding_dimensions = c.embedding_dimensions
  JOIN public.media_archive_records m
    ON m.id = d.media_record_id
  LEFT JOIN public.media_analysis_topics t
    ON t.media_record_id = m.id AND t.is_current = true
  WHERE d.media_record_id IS NOT NULL
    AND d.ingestion_status = 'completed'
    AND c.access_class = p_access_class
    AND d.access_class = p_access_class
    AND c.embedding_model = p_model_id
    AND c.embedding_dimensions = p_dimensions
    AND d.embedding_model = p_model_id
    AND d.embedding_dimensions = p_dimensions
    AND (p_from IS NULL OR COALESCE(m.published_date, d.published_at::date) >= p_from)
    AND (p_to IS NULL OR COALESCE(m.published_date, d.published_at::date) <= p_to)
    AND (p_topics IS NULL OR COALESCE(t.primary_topic, m.topic) = ANY (p_topics))
    AND (
      p_languages IS NULL
      OR UPPER(COALESCE(NULLIF(d.language, ''), NULLIF(m.lang, ''))) = ANY (p_languages)
    )
    AND (p_outlets IS NULL OR m.outlet = ANY (p_outlets))
    AND 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.media_search(
  vector, TEXT, INTEGER, TEXT, INTEGER, DOUBLE PRECISION,
  DATE, DATE, TEXT[], TEXT[], TEXT[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.media_search(
  vector, TEXT, INTEGER, TEXT, INTEGER, DOUBLE PRECISION,
  DATE, DATE, TEXT[], TEXT[], TEXT[]
) TO service_role;

COMMENT ON FUNCTION public.media_search(
  vector, TEXT, INTEGER, TEXT, INTEGER, DOUBLE PRECISION,
  DATE, DATE, TEXT[], TEXT[], TEXT[]
) IS
  'Owner-only semantic search restricted to media coverage documents; reuses existing knowledge_chunks embeddings.';
