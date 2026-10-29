-- Migration: isolated UNFRAMED RAG storage for Pierrot
-- Date: 2026-10-29
-- Status: PROPOSED FOR REVIEW. Not applied or verified against the live project.
--
-- Verified local assumptions:
--   * canonical source: app/unframed/Unframed.markdown
--   * frozen parser: unframed-parser-v1
--   * frozen chunker: unframed-chunker-v1
--   * verified OpenRouter embedding model: baai/bge-m3 (1024 dimensions)
--
-- Unverified live assumptions:
--   * the `vector` extension can be installed by the migration role;
--   * the vector type/operator is reachable through `public` or `extensions`;
--   * PostgREST exposes public tables/functions for the service role;
--   * the live project has no conflicting public.knowledge_* objects.
--
-- Security model:
--   * RLS is enabled and no anon/authenticated policies exist.
--   * anon/authenticated cannot read or write these tables directly.
--   * only the server-side service role may write or execute the search RPC.
--   * the search RPC filters access_class in SQL; it does not trust a client.
--   * no HNSW/IVFFlat index is created for this small corpus. Measure first.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^[a-z0-9_]{3,64}$'),
  title TEXT NOT NULL
    CHECK (char_length(title) BETWEEN 1 AND 200),
  source_path TEXT NOT NULL
    CHECK (char_length(source_path) BETWEEN 1 AND 500)
    CHECK (source_path !~ '^public/'),
  source_sha256 TEXT NOT NULL
    CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_hash TEXT NOT NULL
    CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  parser_version TEXT NOT NULL
    CHECK (char_length(parser_version) BETWEEN 1 AND 80),
  chunker_version TEXT NOT NULL
    CHECK (char_length(chunker_version) BETWEEN 1 AND 80),
  ingestion_version TEXT NOT NULL
    CHECK (char_length(ingestion_version) BETWEEN 1 AND 80),
  embedding_model TEXT NOT NULL
    CHECK (embedding_model = 'baai/bge-m3'),
  embedding_dimensions INTEGER NOT NULL
    CHECK (embedding_dimensions = 1024),
  access_class TEXT NOT NULL
    CHECK (access_class IN ('public', 'owner')),
  chunk_count INTEGER NOT NULL
    CHECK (chunk_count >= 0),
  source_char_count INTEGER NOT NULL
    CHECK (source_char_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, embedding_model, embedding_dimensions)
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id TEXT PRIMARY KEY
    CHECK (id ~ '^chk_[a-f0-9]{32}$'),
  document_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL
    CHECK (chunk_index >= 0),
  content TEXT NOT NULL
    CHECK (char_length(content) BETWEEN 1 AND 4000),
  content_hash TEXT NOT NULL
    CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  heading TEXT NOT NULL
    CHECK (char_length(heading) BETWEEN 1 AND 500),
  section_path TEXT[] NOT NULL
    CHECK (cardinality(section_path) BETWEEN 1 AND 8),
  section_index INTEGER NOT NULL
    CHECK (section_index >= 0),
  char_start INTEGER NOT NULL
    CHECK (char_start >= 0),
  char_end INTEGER NOT NULL
    CHECK (char_end > char_start),
  line_start INTEGER NOT NULL
    CHECK (line_start >= 1),
  line_end INTEGER NOT NULL
    CHECK (line_end >= line_start),
  access_class TEXT NOT NULL
    CHECK (access_class IN ('public', 'owner')),
  embedding vector(1024) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_chunks_document_model_fk
    FOREIGN KEY (document_id, embedding_model, embedding_dimensions)
    REFERENCES public.knowledge_documents (id, embedding_model, embedding_dimensions)
    ON DELETE CASCADE
);

-- No vector index yet: 169 chunks do not justify HNSW/IVFFlat. This lookup
-- index supports scope/model filtering and deterministic ingestion checks.
CREATE INDEX IF NOT EXISTS knowledge_chunks_scope_idx
  ON public.knowledge_chunks (
    document_id,
    access_class,
    embedding_model,
    embedding_dimensions,
    chunk_index
  );

-- Similarity search. Access class is a required SQL predicate, not a client
-- claim. The function returns only retrieval fields; embeddings never leave
-- the database.
CREATE OR REPLACE FUNCTION public.knowledge_search_unframed(
  p_query_embedding vector(1024),
  p_model_id TEXT,
  p_dimensions INTEGER,
  p_access_class TEXT,
  p_document_id TEXT DEFAULT 'doc_unframed_manuscript',
  p_match_count INTEGER DEFAULT 5,
  p_min_similarity DOUBLE PRECISION DEFAULT -1
)
RETURNS TABLE (
  chunk_id TEXT,
  document_id TEXT,
  content TEXT,
  heading TEXT,
  section_path TEXT[],
  section_index INTEGER,
  line_start INTEGER,
  line_end INTEGER,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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

  IF p_document_id IS NULL OR p_document_id = '' OR char_length(p_document_id) > 64 THEN
    RAISE EXCEPTION 'invalid_document_id' USING ERRCODE = '22023';
  END IF;

  IF p_match_count IS NULL OR p_match_count < 1 OR p_match_count > 10 THEN
    RAISE EXCEPTION 'invalid_match_count' USING ERRCODE = '22023';
  END IF;

  IF p_min_similarity IS NULL OR p_min_similarity < -1 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'invalid_min_similarity' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    c.heading,
    c.section_path,
    c.section_index,
    c.line_start,
    c.line_end,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d
    ON d.id = c.document_id
   AND d.embedding_model = c.embedding_model
   AND d.embedding_dimensions = c.embedding_dimensions
  WHERE c.document_id = p_document_id
    AND c.access_class = p_access_class
    AND d.access_class = p_access_class
    AND c.embedding_model = p_model_id
    AND c.embedding_dimensions = p_dimensions
    AND d.embedding_model = p_model_id
    AND d.embedding_dimensions = p_dimensions
    AND 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.knowledge_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_chunks FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_chunks TO service_role;

REVOKE ALL ON FUNCTION public.knowledge_search_unframed(
  vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.knowledge_search_unframed(
  vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, DOUBLE PRECISION
) TO service_role;

COMMENT ON TABLE public.knowledge_documents IS
  'UNFRAMED RAG document metadata. Server-only; owner access by default.';
COMMENT ON TABLE public.knowledge_chunks IS
  'Deterministic UNFRAMED chunks with baai/bge-m3 embeddings. Server-only.';
COMMENT ON FUNCTION public.knowledge_search_unframed(
  vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, DOUBLE PRECISION
) IS
  'Server-only similarity search. Enforces access_class, document, model and dimension in SQL.';
COMMENT ON COLUMN public.knowledge_documents.source_path IS
  'Repository-relative canonical source. Public/ paths are rejected.';
COMMENT ON COLUMN public.knowledge_documents.ingestion_version IS
  'Deterministic local ingestion contract version, recorded with the index.';
COMMENT ON COLUMN public.knowledge_documents.access_class IS
  'owner for UNFRAMED. public is reserved for reviewed public documents.';
