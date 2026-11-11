-- Migration: backfill typed entities from the existing Brain corpus
-- Date: 2026-12-04
--
-- STATUS: PREPARED ONLY. Additive and idempotent. Apply after
-- 2026-12-03_pierrot_context_engine.sql.
--
-- This migration does not reindex Brain and does not change embeddings. It
-- creates typed entities for documents that are clearly a manuscript/book or
-- that match an existing project by name/slug, then links them to that project.
-- The knowledge_documents row remains the canonical source.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Document / book entities
-- ---------------------------------------------------------------------------

with owner_row as (
  select owner_user_id
  from public.pierrot_projects
  order by created_at asc nulls last
  limit 1
),
document_project as (
  select
    d.id as document_id,
    d.title,
    d.source_type,
    project.id as project_id,
    owner.owner_user_id
  from public.knowledge_documents d
  cross join owner_row owner
  left join lateral (
    select p.id, p.owner_user_id
    from public.pierrot_projects p
    where p.owner_user_id = owner.owner_user_id
      and (
        -- Match whole words, not substrings: "Journal" must not match
        -- "LiveJournal", while "UNFRAMED" and "Heart & Angel" still match.
        (
          ' ' || btrim(lower(regexp_replace(d.title, '[^[:alnum:]]+', ' ', 'g'))) || ' '
        ) like (
          '% ' || btrim(lower(regexp_replace(p.name, '[^[:alnum:]]+', ' ', 'g'))) || ' %'
        )
        or (
          ' ' || btrim(lower(regexp_replace(d.title, '[^[:alnum:]]+', ' ', 'g'))) || ' '
        ) like (
          '% ' || btrim(lower(regexp_replace(p.slug, '[^[:alnum:]]+', ' ', 'g'))) || ' %'
        )
      )
    order by length(p.name) desc
    limit 1
  ) project on true
  where project.id is not null
     or d.source_type in ('manuscript', 'book')
)
insert into public.pierrot_entities (
  owner_user_id,
  entity_type,
  name,
  canonical_name,
  description,
  project_id,
  status,
  aliases,
  source_refs,
  metadata
)
select
  dp.owner_user_id,
  case
    when dp.source_type in ('manuscript', 'book') then 'BOOK'
    else 'DOCUMENT'
  end,
  dp.title,
  coalesce(
    nullif(btrim(lower(regexp_replace(dp.title, '[^[:alnum:]]+', ' ', 'g'))), ''),
    lower(dp.document_id)
  ),
  '',
  dp.project_id,
  'active',
  array[]::text[],
  jsonb_build_array(
    jsonb_build_object(
      'type', 'knowledge_document',
      'id', dp.document_id,
      'backfill', 'entity_backfill_v1'
    )
  ),
  jsonb_build_object(
    'backfill', 'entity_backfill_v1',
    'source_type', dp.source_type
  )
from document_project dp
on conflict (owner_user_id, entity_type, canonical_name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Project -> book/document relations
-- ---------------------------------------------------------------------------

insert into public.pierrot_entity_relations (
  owner_user_id,
  from_entity_id,
  to_entity_id,
  relation_type,
  confidence,
  evidence_class,
  source_refs
)
select
  child.owner_user_id,
  parent.id::text,
  child.id::text,
  case child.entity_type
    when 'BOOK' then 'SOURCE_WORK'
    else 'HAS_DOCUMENT'
  end,
  0.8,
  'DOCUMENTED',
  jsonb_build_array(
    jsonb_build_object(
      'backfill', 'entity_backfill_v1',
      'child_entity_id', child.id
    )
  )
from public.pierrot_entities child
join public.pierrot_entities parent
  on parent.owner_user_id = child.owner_user_id
 and parent.entity_type = 'PROJECT'
 and parent.project_id = child.project_id
where child.entity_type in ('BOOK', 'DOCUMENT')
  and child.project_id is not null
  and parent.id <> child.id
on conflict (owner_user_id, from_entity_id, to_entity_id, relation_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Verify the mandatory UNFRAMED distinction without hardcoding it
-- ---------------------------------------------------------------------------

do $$
declare
  book_count integer;
  project_count integer;
begin
  select count(*) into book_count
  from public.pierrot_entities
  where entity_type = 'BOOK'
    and canonical_name = 'unframed';

  select count(*) into project_count
  from public.pierrot_entities
  where entity_type = 'PROJECT'
    and canonical_name = 'unframed';

  if book_count > 0 and project_count > 0 then
    raise notice 'UNFRAMED: BOOK and PROJECT entities both present';
  elsif project_count > 0 then
    raise notice 'UNFRAMED: PROJECT present but no BOOK entity matched the corpus';
  end if;
end
$$;
