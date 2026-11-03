-- Migration: Brain hybrid retrieval — real HNSW and GIN candidate selection
-- Date: 2026-11-03
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Why this exists
-- ---------------
-- The previous `brain_search_hybrid` built one large `base` CTE and sorted it
-- by the computed alias `similarity`. That shape lets PostgreSQL choose a
-- sequential scan + sort instead of the HNSW index, and it evaluates
-- `ts_rank_cd()` over far more rows than necessary.
--
-- This version keeps candidate selection in two separate, bounded branches:
--   1. vector candidates are ordered directly by `embedding <=> query`;
--   2. lexical candidates are filtered with `@@` so the GIN index is used,
--      and only then ranked with `ts_rank_cd()`;
--   3. the two candidate sets are deduplicated by chunk id and fused with
--      Reciprocal Rank Fusion (RRF), not by adding incompatible raw scores.
--
-- Verified production facts (read-only, 2026-11-03):
--   * pgvector 0.8.0;
--   * knowledge_chunks.embedding is vector(1024);
--   * 240 documents, 2,736 chunks, all with embeddings;
--   * HNSW index knowledge_chunks_embedding_hnsw_idx exists;
--   * GIN index knowledge_chunks_content_fts_idx exists;
--   * all current chunks are access_class = 'owner'.
--
-- Safety:
--   * no data is deleted, rewritten or re-embedded;
--   * the function remains SECURITY DEFINER and service_role-only;
--   * owner/public access_class filters are preserved;
--   * p_document_ids and all existing metadata/date filters are preserved.
--
-- Apply manually only. If the corpus grows substantially, run any new index
-- statement manually with CREATE INDEX CONCURRENTLY outside a transaction.

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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tsquery tsquery;
  v_candidate_limit integer;
begin
  if p_model_id is null or p_model_id = '' or char_length(p_model_id) > 100 then
    raise exception 'invalid_model_id' using errcode = '22023';
  end if;

  if p_dimensions is null or p_dimensions <> 1024 then
    raise exception 'invalid_dimensions' using errcode = '22023';
  end if;

  if p_access_class not in ('public', 'owner') then
    raise exception 'invalid_access_class' using errcode = '22023';
  end if;

  if p_match_count is null or p_match_count < 1 or p_match_count > 60 then
    raise exception 'invalid_match_count' using errcode = '22023';
  end if;

  if p_min_similarity is null or p_min_similarity < -1 or p_min_similarity > 1 then
    raise exception 'invalid_min_similarity' using errcode = '22023';
  end if;

  if p_query_text is not null and char_length(p_query_text) > 4000 then
    raise exception 'invalid_query_text' using errcode = '22023';
  end if;

  -- Keep candidate selection bounded. At the current corpus size 120 is the
  -- largest limit that still lets the planner choose the HNSW index instead
  -- of a sequential scan + sort.
  v_candidate_limit := least(greatest(p_match_count * 2, 40), 120);

  if p_query_text is not null and btrim(p_query_text) <> '' then
    v_tsquery := plainto_tsquery('simple', p_query_text);
  else
    v_tsquery := null;
  end if;

  return query
  with vector_candidates as (
    select
      c.id as chunk_id,
      c.document_id,
      1 - (c.embedding <=> p_query_embedding) as similarity
    from public.knowledge_chunks c
    where c.access_class = p_access_class
      and c.embedding_model = p_model_id
      and c.embedding_dimensions = p_dimensions
      and (p_document_ids is null or c.document_id = any (p_document_ids))
    order by c.embedding <=> p_query_embedding
    limit v_candidate_limit
  ),
  lexical_candidates as (
    select
      c.id as chunk_id,
      c.document_id,
      1 - (c.embedding <=> p_query_embedding) as similarity,
      ts_rank_cd(
        to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content),
        v_tsquery
      )::double precision as lexical_score
    from public.knowledge_chunks c
    where v_tsquery is not null
      and c.access_class = p_access_class
      and c.embedding_model = p_model_id
      and c.embedding_dimensions = p_dimensions
      and (p_document_ids is null or c.document_id = any (p_document_ids))
      and to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content) @@ v_tsquery
    order by lexical_score desc, c.embedding <=> p_query_embedding, c.id
    limit v_candidate_limit
  ),
  vector_ranked as (
    select
      v.chunk_id,
      v.document_id,
      v.similarity,
      row_number() over (order by v.similarity desc, v.chunk_id) as vector_rank
    from vector_candidates v
  ),
  lexical_ranked as (
    select
      l.chunk_id,
      l.document_id,
      l.similarity,
      l.lexical_score,
      row_number() over (
        order by l.lexical_score desc, l.similarity desc, l.chunk_id
      ) as lexical_rank
    from lexical_candidates l
  ),
  merged as (
    select
      coalesce(v.chunk_id, l.chunk_id) as chunk_id,
      coalesce(v.document_id, l.document_id) as document_id,
      coalesce(v.similarity, l.similarity) as similarity,
      coalesce(l.lexical_score, 0::double precision) as lexical_score,
      coalesce(1.0 / (60 + v.vector_rank), 0::double precision)
        + coalesce(1.0 / (60 + l.lexical_rank), 0::double precision) as fused_score
    from vector_ranked v
    full outer join lexical_ranked l on l.chunk_id = v.chunk_id
  )
  select
    m.chunk_id,
    m.document_id,
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
    m.similarity,
    m.lexical_score
  from merged m
  join public.knowledge_chunks c on c.id = m.chunk_id
  join public.knowledge_documents d
    on d.id = m.document_id
   and d.embedding_model = c.embedding_model
   and d.embedding_dimensions = c.embedding_dimensions
  where d.ingestion_status = 'completed'
    and d.access_class = p_access_class
    and d.embedding_model = p_model_id
    and d.embedding_dimensions = p_dimensions
    and (p_source_types is null or d.source_type = any (p_source_types))
    and (p_languages is null or d.language = any (p_languages))
    and (p_authors is null or lower(coalesce(d.author, '')) = any (p_authors))
    and (p_published_from is null or d.published_at >= p_published_from)
    and (p_published_to is null or d.published_at <= p_published_to)
    and (
      p_source_domains is null
      or exists (
        select 1
        from unnest(p_source_domains) as allowed_domain
        where coalesce(
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
          ) = allowed_domain
          or coalesce(
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
          ) like '%.' || allowed_domain
      )
    )
    and (m.similarity >= p_min_similarity or m.lexical_score > 0)
  order by m.fused_score desc, m.similarity desc, m.chunk_id
  limit p_match_count;
end;
$$;

revoke all on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) from public, anon, authenticated;

grant execute on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) to service_role;

comment on function public.brain_search_hybrid(
  vector, text, integer, text, text, text[], text[], text[], text[], text[],
  timestamptz, timestamptz, integer, double precision
) is
  'Server-only hybrid Brain search: HNSW vector candidates + GIN lexical candidates, deduplicated and RRF-fused.';
