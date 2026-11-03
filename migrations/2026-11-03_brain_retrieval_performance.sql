-- Migration: Brain hybrid retrieval performance and candidate fusion
-- Date: 2026-11-03
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Verified production facts (read-only, 2026-11-03):
--   * pgvector 0.8.0 is installed;
--   * knowledge_chunks.embedding is vector(1024);
--   * 2,736 chunks and 2,736 non-null embeddings;
--   * no vector index exists on knowledge_chunks.embedding;
--   * a GIN FTS index exists on heading + content.
--
-- This migration:
--   1. adds an HNSW cosine index for BGE-M3 vectors;
--   2. replaces brain_search_hybrid with a bounded candidate-fusion query
--      (vector top candidates + lexical top candidates + deduplication).
--
-- It does not delete data, change embeddings or trigger re-indexing.
-- For a much larger table, run the index statement manually with
-- CREATE INDEX CONCURRENTLY outside a transaction.

create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

analyze public.knowledge_chunks;

create or replace function public.brain_search_hybrid(
  p_query_embedding vector,
  p_model_id text,
  p_dimensions integer,
  p_access_class text,
  p_query_text text default null,
  p_source_types text[] default null,
  p_source_domains text[] default null,
  p_authors text[] default null,
  p_languages text[] default null,
  p_document_ids text[] default null,
  p_published_from timestamptz default null,
  p_published_to timestamptz default null,
  p_match_count integer default 40,
  p_min_similarity double precision default -1
)
returns table (
  chunk_id text,
  document_id text,
  document_title text,
  source_type text,
  source_domain text,
  author text,
  language text,
  published_at timestamptz,
  content text,
  heading text,
  section_path text[],
  section_index integer,
  line_start integer,
  line_end integer,
  similarity double precision,
  lexical_score double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      c.id as chunk_id,
      c.document_id,
      d.title as document_title,
      d.source_type,
      coalesce(
        nullif(d.metadata->>'source_domain', ''),
        split_part(
          regexp_replace(
            coalesce(d.canonical_url, d.source_url, d.source_path, ''),
            '^https?://',
            ''
          ),
          '/',
          1
        )
      ) as source_domain,
      d.author,
      d.language,
      d.published_at,
      c.content,
      c.heading,
      c.section_path,
      c.section_index,
      c.line_start,
      c.line_end,
      1 - (c.embedding <=> p_query_embedding) as similarity,
      case
        when p_query_text is null or btrim(p_query_text) = '' then 0::double precision
        else ts_rank_cd(
          to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content),
          plainto_tsquery('simple', p_query_text)
        )::double precision
      end as lexical_score
    from public.knowledge_chunks c
    join public.knowledge_documents d
      on d.id = c.document_id
     and d.embedding_model = c.embedding_model
     and d.embedding_dimensions = c.embedding_dimensions
    where d.ingestion_status = 'completed'
      and c.access_class = p_access_class
      and d.access_class = p_access_class
      and c.embedding_model = p_model_id
      and c.embedding_dimensions = p_dimensions
      and d.embedding_model = p_model_id
      and d.embedding_dimensions = p_dimensions
      and (p_source_types is null or d.source_type = any (p_source_types))
      and (p_document_ids is null or c.document_id = any (p_document_ids))
      and (p_languages is null or d.language = any (p_languages))
      and (p_authors is null or lower(coalesce(d.author, '')) = any (p_authors))
      and (p_published_from is null or d.published_at >= p_published_from)
      and (p_published_to is null or d.published_at <= p_published_to)
  ),
  vector_candidates as (
    select *
    from base
    order by similarity desc, chunk_id
    limit greatest(p_match_count * 2, 40)
  ),
  lexical_candidates as (
    select *
    from base
    where lexical_score > 0
    order by lexical_score desc, similarity desc, chunk_id
    limit greatest(p_match_count * 2, 40)
  ),
  merged as (
    select * from vector_candidates
    union
    select * from lexical_candidates
  )
  select
    merged.chunk_id,
    merged.document_id,
    merged.document_title,
    merged.source_type,
    merged.source_domain,
    merged.author,
    merged.language,
    merged.published_at,
    merged.content,
    merged.heading,
    merged.section_path,
    merged.section_index,
    merged.line_start,
    merged.line_end,
    merged.similarity,
    merged.lexical_score
  from merged
  where (p_source_domains is null or exists (
      select 1
      from unnest(p_source_domains) as allowed_domain
      where merged.source_domain = allowed_domain
        or merged.source_domain like '%.' || allowed_domain
    ))
    and (merged.similarity >= p_min_similarity or merged.lexical_score > 0)
  order by
    (0.8 * merged.similarity + 0.2 * least(1::double precision, merged.lexical_score)) desc,
    merged.similarity desc,
    merged.chunk_id
  limit p_match_count;
$$;

revoke all on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) from public, anon, authenticated;

grant execute on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) to service_role;

comment on index public.knowledge_chunks_embedding_hnsw_idx is
  'BGE-M3 1024d cosine HNSW index for Brain hybrid retrieval.';

comment on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) is
  'Server-only hybrid Brain search: bounded vector + lexical candidates, deduplicated and fused.';
