-- Migration: Pierrot Temporal Memory, hybrid retrieval and Brain status
-- Date: 2026-11-19
--
-- STATUS: PREPARED ONLY. Do not apply automatically. Review on staging, then
-- run manually in Supabase. The application degrades honestly while this
-- migration is absent:
--   * memory CRUD continues on the legacy columns;
--   * search falls back to lexical retrieval;
--   * Brain status reports that semantic indexing is not ready.
--
-- This migration is additive. It does not delete, rewrite or move existing
-- records and it does not change RLS ownership of pierrot_decisions.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. Temporal semantics on the existing owner-memory table
-- ---------------------------------------------------------------------------

alter table public.pierrot_decisions
  add column if not exists importance real not null default 0.5;

alter table public.pierrot_decisions
  add column if not exists confidence real not null default 0.7;

alter table public.pierrot_decisions
  add column if not exists valid_from timestamptz;

alter table public.pierrot_decisions
  add column if not exists valid_until timestamptz;

alter table public.pierrot_decisions
  add column if not exists last_referenced_at timestamptz;

alter table public.pierrot_decisions
  add column if not exists archived_reason text;

-- The original schema already documents superseded_by. The IF NOT EXISTS is
-- defensive: it is a no-op when the column is present.
alter table public.pierrot_decisions
  add column if not exists superseded_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pierrot_decisions_importance_check'
      and conrelid = 'public.pierrot_decisions'::regclass
  ) then
    alter table public.pierrot_decisions
      add constraint pierrot_decisions_importance_check
      check (importance >= 0 and importance <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pierrot_decisions_confidence_check'
      and conrelid = 'public.pierrot_decisions'::regclass
  ) then
    alter table public.pierrot_decisions
      add constraint pierrot_decisions_confidence_check
      check (confidence >= 0 and confidence <= 1);
  end if;
end
$$;

-- Expand the existing kind/status checks without creating a second system of
-- statuses. Existing values remain valid.
alter table public.pierrot_decisions
  drop constraint if exists pierrot_decisions_kind_check;

alter table public.pierrot_decisions
  add constraint pierrot_decisions_kind_check
  check (
    kind = any (
      array[
        'decision',
        'position',
        'preference',
        'constraint',
        'task',
        'rejected_recommendation',
        'memory',
        'saved',
        'reminder'
      ]::text[]
    )
  );

alter table public.pierrot_decisions
  drop constraint if exists pierrot_decisions_status_check;

alter table public.pierrot_decisions
  add constraint pierrot_decisions_status_check
  check (
    status = any (
      array[
        'current',
        'superseded',
        'rejected',
        'uncertain',
        'completed',
        'archived'
      ]::text[]
    )
  );

create index if not exists pierrot_decisions_user_kind_status_idx
  on public.pierrot_decisions (user_id, kind, status, updated_at desc);

create index if not exists pierrot_decisions_user_review_idx
  on public.pierrot_decisions (user_id, review_at)
  where review_at is not null;

create index if not exists pierrot_decisions_user_status_updated_idx
  on public.pierrot_decisions (user_id, status, updated_at desc);

create index if not exists pierrot_decisions_user_importance_idx
  on public.pierrot_decisions (user_id, importance desc)
  where status = 'current';

-- ---------------------------------------------------------------------------
-- 2. Memory embeddings (separate from knowledge_chunks / Brain documents)
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_memory_embeddings (
  decision_id uuid primary key
    references public.pierrot_decisions(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  model_id text not null,
  dimensions integer not null check (dimensions = 1024),
  content_hash text not null,
  embedding vector(1024),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  error_code text,
  indexed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists pierrot_memory_embeddings_user_status_idx
  on public.pierrot_memory_embeddings (user_id, status);

create index if not exists pierrot_memory_embeddings_embedding_idx
  on public.pierrot_memory_embeddings
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null and status = 'ready';

alter table public.pierrot_memory_embeddings enable row level security;

revoke all on table public.pierrot_memory_embeddings from anon, authenticated;
grant all on table public.pierrot_memory_embeddings to service_role;

-- ---------------------------------------------------------------------------
-- 3. Hybrid memory search RPC (vector + lexical + filters)
-- ---------------------------------------------------------------------------

create or replace function public.pierrot_memory_search(
  p_user_id uuid,
  p_query_embedding vector(1024) default null,
  p_query_text text default null,
  p_include_archive boolean default false,
  p_kinds text[] default null,
  p_statuses text[] default null,
  p_project text default null,
  p_tags text[] default null,
  p_match_count integer default 24,
  p_min_similarity double precision default -1
)
returns table (
  decision_id text,
  similarity double precision,
  lexical_score double precision,
  combined_score double precision
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_user_id' using errcode = '22023';
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

  return query
  with scored as (
    select
      d.id::text as decision_id,
      case
        when p_query_embedding is null or e.embedding is null then 0::double precision
        else greatest(0::double precision, 1 - (e.embedding <=> p_query_embedding))
      end as similarity,
      case
        when p_query_text is null or btrim(p_query_text) = '' then 0::double precision
        else least(
          1::double precision,
          ts_rank_cd(
            to_tsvector('simple', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
            plainto_tsquery('simple', p_query_text)
          ) * 6::double precision
        )
      end as lexical_score,
      coalesce(d.importance, 0.5)::double precision as importance
    from public.pierrot_decisions d
    left join public.pierrot_memory_embeddings e
      on e.decision_id = d.id and e.status = 'ready'
    where d.user_id = p_user_id
      and (p_kinds is null or d.kind = any (p_kinds))
      and (
        (p_statuses is not null and d.status = any (p_statuses))
        or (
          p_statuses is null
          and (p_include_archive or d.status in ('current', 'uncertain'))
        )
      )
      and (p_project is null or d.project = p_project)
      and (p_tags is null or coalesce(d.tags, '{}'::text[]) @> p_tags)
  )
  select
    scored.decision_id,
    scored.similarity,
    scored.lexical_score,
    (scored.similarity * 0.70 + scored.lexical_score * 0.20 + scored.importance * 0.10)
      as combined_score
  from scored
  where
    (p_query_embedding is null or scored.similarity >= p_min_similarity)
    and (
      p_query_text is null
      or scored.lexical_score > 0
      or (p_query_embedding is not null and scored.similarity > 0)
    )
  order by combined_score desc, scored.importance desc
  limit p_match_count;
end;
$$;

revoke all on function public.pierrot_memory_search(
  uuid, vector, text, boolean, text[], text[], text, text[], integer, double precision
) from public, anon, authenticated;

grant execute on function public.pierrot_memory_search(
  uuid, vector, text, boolean, text[], text[], text, text[], integer, double precision
) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Cached Brain status snapshot
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_brain_status_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null
    check (state in ('stable', 'attention', 'updating', 'degraded')),
  label text not null,
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  detail jsonb,
  storage_available boolean not null default true,
  retrieval_available boolean not null default true,
  embedding_provider_available boolean not null default true,
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pierrot_brain_status_snapshots enable row level security;

revoke all on table public.pierrot_brain_status_snapshots from anon, authenticated;
grant all on table public.pierrot_brain_status_snapshots to service_role;

comment on table public.pierrot_decisions is
  'Owner-only Pierrot decisions, durable memory, saved notes and reminders. Access is service-role only; RLS has no public policies.';

comment on table public.pierrot_memory_embeddings is
  'Owner-only embeddings for Temporal Memory records. Separate from Brain knowledge_chunks.';

comment on table public.pierrot_brain_status_snapshots is
  'Cached deterministic Brain status. No AI content; invalidated on meaningful memory changes.';
