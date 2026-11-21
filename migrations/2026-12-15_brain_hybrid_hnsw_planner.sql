-- Migration: Brain hybrid retrieval — deterministic HNSW candidate selection
-- Date: 2026-12-15
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Root cause
-- ----------
-- public.brain_search_hybrid already separates vector and lexical candidates,
-- but the vector branch is a plain `ORDER BY embedding <=> query LIMIT n`
-- statement. On a production-like corpus PostgreSQL estimated a sequential
-- scan + top-N sort as cheaper than the existing
-- knowledge_chunks_embedding_hnsw_idx index. The controlled probe measured
-- ~1.8 s for the default plan and ~0.48 s for the HNSW plan (hnsw.ef_search =
-- 120) on the same data. Diagnostic queries that use a materialized CTE are
-- not used as a baseline.
--
-- Chosen approach (option B in the task, narrowly scoped)
-- ------------------------------------------------------
-- A dedicated candidate function changes planner settings only for its own
-- statement, transaction-locally, and only for the whole-Brain path (no
-- document filter):
--
--   * enable_seqscan = off  — removes the sequential scan + sort alternative;
--   * enable_sort    = off  — prevents the scope index + sort alternative;
--   * hnsw.ef_search = 120  — provisional recall floor, to be confirmed by the
--                             benchmark harness at 40/80/120.
--
-- Document-scoped requests (p_document_ids is not null) keep the planner's
-- default behaviour. The previous implementation used the same filtered
-- `ORDER BY ... LIMIT` shape; locally the planner chooses the scope index plus
-- a sort. That is preserved behaviour, not a hard guarantee, and forcing HNSW
-- there would change scoped retrieval semantics for no measured gain.
--
-- Every setting is applied with set_config(..., is_local => true), so it is
-- guaranteed to revert at transaction end, and is explicitly restored before
-- the function returns. No ALTER DATABASE / ALTER ROLE is used, no global
-- sequential-scan disable is used, and no setting can survive into a pooled
-- connection after the transaction commits or aborts.
--
-- The lexical branch, RRF fusion, access/source/date filters, candidate limits,
-- deduplication and final TS ranking are unchanged. No index is created,
-- dropped or rebuilt. No data is modified or re-embedded.
--
-- Why not option A (SQL-only rewrite)
-- -----------------------------------
-- The vector branch already has the canonical `ORDER BY distance LIMIT n`
-- shape required by pgvector. The planner still prefers a sequential scan on
-- a corpus of this size, and PostgreSQL has no SQL hint that can force an HNSW
-- scan. Rewriting the query without a planner-scoped setting would be either
-- non-deterministic or would change candidate/filter semantics. The helper
-- keeps the exact same candidate semantics while making the plan deterministic.
--
-- Rollback
-- --------
-- migrations/rollback/2026-12-15_brain_hybrid_hnsw_planner_rollback.sql
-- restores the previous public.brain_search_hybrid definition (RRF version
-- from 2026-11-03_brain_hybrid_hnsw_fix.sql) and drops the new helper. It
-- does not drop or rebuild knowledge_chunks_embedding_hnsw_idx.
--
-- Apply manually only after review and only to staging/preview first.

begin;

-- ---------------------------------------------------------------------------
-- Bounded vector candidate selection.
--
-- This function is the only place where planner settings are changed. Keeping
-- them here means the lexical branch and the final fusion query are planned
-- with the normal settings and cannot be slowed down by an unrelated hint.
-- ---------------------------------------------------------------------------
create or replace function public.brain_vector_candidates(
  p_query_embedding vector,
  p_model_id text,
  p_dimensions integer,
  p_access_class text,
  p_document_ids text[],
  p_limit integer default 40,
  p_ef_search integer default 120
)
returns table (
  chunk_id text,
  document_id text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
rows 120
as $$
declare
  v_prior_seqscan text;
  v_prior_sort text;
  v_prior_ef_search text;
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

  if p_limit is null or p_limit < 1 or p_limit > 120 then
    raise exception 'invalid_candidate_limit' using errcode = '22023';
  end if;

  if p_ef_search is null or p_ef_search < 40 or p_ef_search > 1000 then
    raise exception 'invalid_ef_search' using errcode = '22023';
  end if;

  v_prior_seqscan := current_setting('enable_seqscan');
  v_prior_sort := current_setting('enable_sort');
  -- hnsw.ef_search is provided by pgvector. current_setting(..., true) returns
  -- NULL instead of raising if the extension is unavailable.
  v_prior_ef_search := current_setting('hnsw.ef_search', true);

  if p_document_ids is null then
    -- Whole-Brain path: this is the measured bottleneck. These settings are
    -- transaction-local and restored before return.
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_sort', 'off', true);
    perform set_config('hnsw.ef_search', p_ef_search::text, true);

    begin
      return query
      select
        c.id as chunk_id,
        c.document_id,
        1 - (c.embedding <=> p_query_embedding) as similarity
      from public.knowledge_chunks c
      where c.access_class = p_access_class
        and c.embedding_model = p_model_id
        and c.embedding_dimensions = p_dimensions
      order by c.embedding <=> p_query_embedding
      limit p_limit;
    exception when others then
      perform set_config('enable_seqscan', v_prior_seqscan, true);
      perform set_config('enable_sort', v_prior_sort, true);
      -- If the GUC was unset before the call, NULL resets it instead of
      -- inventing a value that would leak inside the transaction.
      perform set_config('hnsw.ef_search', v_prior_ef_search, true);
      raise;
    end;

    perform set_config('enable_seqscan', v_prior_seqscan, true);
    perform set_config('enable_sort', v_prior_sort, true);
    perform set_config('hnsw.ef_search', v_prior_ef_search, true);
  else
    -- Document-scoped path: preserve the planner's default behaviour. The
    -- previous implementation used the same filtered `ORDER BY ... LIMIT`
    -- shape and kept the default plan; locally that is
    -- knowledge_chunks_scope_idx + sort. This is preserved behaviour, not a
    -- hard guarantee that the planner will never choose HNSW for a scope.
    -- Forcing HNSW here would change scoped retrieval semantics.
    return query
    select
      c.id as chunk_id,
      c.document_id,
      1 - (c.embedding <=> p_query_embedding) as similarity
    from public.knowledge_chunks c
    where c.access_class = p_access_class
      and c.embedding_model = p_model_id
      and c.embedding_dimensions = p_dimensions
      and c.document_id = any (p_document_ids)
    order by c.embedding <=> p_query_embedding
    limit p_limit;
  end if;
end;
$$;

revoke all on function public.brain_vector_candidates(
  vector, text, integer, text, text[], integer, integer
) from public, anon, authenticated;

grant execute on function public.brain_vector_candidates(
  vector, text, integer, text, text[], integer, integer
) to service_role;

comment on function public.brain_vector_candidates(
  vector, text, integer, text, text[], integer, integer
) is
  'Server-only bounded HNSW vector candidate selection. Planner settings are transaction-local and restored before return.';

-- ---------------------------------------------------------------------------
-- Hybrid search. Only the vector candidate CTE changes: it now calls the
-- bounded helper. Lexical candidates, RRF fusion, filters, deduplication and
-- the final ordering are byte-for-byte the previous implementation.
-- ---------------------------------------------------------------------------
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

  -- Candidate limits are intentionally unchanged.
  v_candidate_limit := least(greatest(p_match_count * 2, 40), 120);

  if p_query_text is not null and btrim(p_query_text) <> '' then
    v_tsquery := plainto_tsquery('simple', p_query_text);
  else
    v_tsquery := null;
  end if;

  return query
  with vector_candidates as (
    select
      v.chunk_id,
      v.document_id,
      v.similarity
    from public.brain_vector_candidates(
      p_query_embedding,
      p_model_id,
      p_dimensions,
      p_access_class,
      p_document_ids,
      v_candidate_limit,
      120
    ) as v
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
  'Server-only hybrid Brain search: HNSW vector candidates + GIN lexical candidates, deduplicated and RRF-fused. Vector planner hints are transaction-local.';

commit;
