-- Migration: Pierrot unified context engine
-- Date: 2026-12-03
--
-- STATUS: PREPARED ONLY. Review on staging, then apply manually. This migration
-- is additive and reversible; it does not delete, rewrite or move messages,
-- projects, decisions or Brain documents.
--
-- What it adds:
--   1. an ingestion timestamp on messages (event time remains created_at);
--   2. a typed entity model separate from, but linked to, pierrot_projects;
--   3. entity relations, including book/project/series/video/page relations;
--   4. an append-only project event timeline with evidence classes;
--   5. project status history;
--   6. retrieval indexes.
--
-- Rollback: migrations/rollback/2026-12-03_pierrot_context_engine_rollback.sql

create extension if not exists pgcrypto;

-- pg_trgm improves substring retrieval but may not be installable by the
-- migration role. It is optional: the migration and all retrieval paths work
-- without it.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm unavailable; skipping optional trigram indexes';
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Event time vs ingestion time
-- ---------------------------------------------------------------------------

alter table public.pierrot_messages
  add column if not exists ingested_at timestamptz;

-- Historical rows keep their original event time as the best available
-- ingestion approximation. No created_at value is changed.
update public.pierrot_messages
set ingested_at = created_at
where ingested_at is null;

alter table public.pierrot_messages
  alter column ingested_at set default now();

create index if not exists pierrot_messages_created_at_idx
  on public.pierrot_messages (created_at);

create index if not exists pierrot_messages_conversation_created_idx
  on public.pierrot_messages (conversation_id, created_at);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists pierrot_messages_content_trgm_idx
      on public.pierrot_messages using gin (content gin_trgm_ops)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Typed entities
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_entities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'PROJECT', 'WORK', 'BOOK', 'CHAPTER', 'DOCUMENT', 'MEDIA_ASSET',
      'VIDEO', 'SERIES', 'EPISODE', 'WEBSITE', 'PAGE', 'PROPOSAL',
      'TASK', 'EVENT', 'DECISION', 'CONVERSATION'
    )
  ),
  name text not null check (char_length(name) between 1 and 240),
  canonical_name text not null check (char_length(canonical_name) between 1 and 240),
  description text not null default '',
  -- A PROJECT entity points at the canonical pierrot_projects row. Other
  -- entity types point at the owning project, but their own id stays stable.
  project_id uuid references public.pierrot_projects(id) on delete set null,
  parent_entity_id uuid references public.pierrot_entities(id) on delete set null,
  status text not null default 'active',
  aliases text[] not null default '{}'::text[],
  source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, entity_type, canonical_name)
);

create index if not exists pierrot_entities_owner_type_idx
  on public.pierrot_entities (owner_user_id, entity_type, updated_at desc);

create index if not exists pierrot_entities_project_idx
  on public.pierrot_entities (owner_user_id, project_id, entity_type);

create table if not exists public.pierrot_entity_relations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  from_entity_id text not null,
  to_entity_id text not null,
  relation_type text not null check (
    relation_type in (
      'SOURCE_WORK', 'HAS_SERIES', 'HAS_VIDEO', 'HAS_PAGE', 'HAS_PROPOSAL',
      'HAS_CONVERSATION', 'HAS_CHAPTER', 'HAS_EDITION', 'HAS_DELIVERABLE',
      'HAS_DOCUMENT', 'HAS_TASK', 'HAS_DECISION', 'HAS_EVENT',
      'PUBLISHED_AS', 'PART_OF', 'RELATED_TO', 'MENTIONED_IN'
    )
  ),
  confidence real not null default 0.8 check (confidence >= 0 and confidence <= 1),
  evidence_class text not null default 'DOCUMENTED' check (
    evidence_class in (
      'MEASURED', 'USER_CONFIRMED', 'DIRECTLY_OBSERVED',
      'DOCUMENTED', 'INFERRED', 'UNKNOWN'
    )
  ),
  source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array'),
  created_at timestamptz not null default now(),
  unique (owner_user_id, from_entity_id, to_entity_id, relation_type)
);

create index if not exists pierrot_entity_relations_from_idx
  on public.pierrot_entity_relations (owner_user_id, from_entity_id, relation_type);

create index if not exists pierrot_entity_relations_to_idx
  on public.pierrot_entity_relations (owner_user_id, to_entity_id, relation_type);

-- Every existing project becomes a PROJECT entity. The project row remains
-- canonical; this row only gives the entity layer a stable typed identity.
insert into public.pierrot_entities (
  owner_user_id,
  entity_type,
  name,
  canonical_name,
  description,
  project_id,
  status,
  aliases,
  source_refs
)
select
  p.owner_user_id,
  'PROJECT',
  p.name,
  coalesce(
    nullif(btrim(lower(regexp_replace(p.name, '[^[:alnum:]]+', ' ', 'g'))), ''),
    lower(p.id::text)
  ),
  p.description,
  p.id,
  case
    when p.status = 'archived' then 'archived'
    when p.status = 'paused' then 'paused'
    else 'active'
  end,
  array_remove(array[p.slug, lower(p.name)], null),
  jsonb_build_array(jsonb_build_object('type', 'project', 'id', p.id))
from public.pierrot_projects p
on conflict (owner_user_id, entity_type, canonical_name) do nothing;

-- Existing project artifacts become typed child entities. This is generic:
-- a video artifact becomes VIDEO, a manuscript/book artifact becomes BOOK,
-- a series artifact becomes SERIES, and so on. It never creates a second
-- project row and never invents an artifact.
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
  a.owner_user_id,
  case lower(coalesce(a.artifact_type, 'document'))
    when 'book' then 'BOOK'
    when 'manuscript' then 'BOOK'
    when 'chapter' then 'CHAPTER'
    when 'video' then 'VIDEO'
    when 'series' then 'SERIES'
    when 'episode' then 'EPISODE'
    when 'website' then 'WEBSITE'
    when 'page' then 'PAGE'
    when 'proposal' then 'PROPOSAL'
    else 'DOCUMENT'
  end,
  a.title,
  coalesce(
    nullif(btrim(lower(regexp_replace(a.title, '[^[:alnum:]]+', ' ', 'g'))), ''),
    lower(a.id::text)
  ),
  left(coalesce(a.content, ''), 2000),
  a.project_id,
  'active',
  array[]::text[],
  jsonb_build_array(jsonb_build_object('type', 'artifact', 'id', a.id)),
  jsonb_build_object('artifact_type', a.artifact_type)
from public.pierrot_project_artifacts a
on conflict (owner_user_id, entity_type, canonical_name) do nothing;

-- Explicit project → child relations derived from the same artifacts.
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
    when 'SERIES' then 'HAS_SERIES'
    when 'VIDEO' then 'HAS_VIDEO'
    when 'PAGE' then 'HAS_PAGE'
    when 'PROPOSAL' then 'HAS_PROPOSAL'
    when 'CHAPTER' then 'HAS_CHAPTER'
    when 'DOCUMENT' then 'HAS_DOCUMENT'
    else 'RELATED_TO'
  end,
  0.8,
  'DOCUMENTED',
  child.source_refs
from public.pierrot_entities child
join public.pierrot_entities parent
  on parent.owner_user_id = child.owner_user_id
 and parent.entity_type = 'PROJECT'
 and parent.project_id = child.project_id
where child.entity_type <> 'PROJECT'
  and child.project_id is not null
  and parent.id <> child.id
on conflict (owner_user_id, from_entity_id, to_entity_id, relation_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Project event timeline
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null default 'event',
  title text not null default '',
  description text not null default '',
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  evidence_class text not null default 'UNKNOWN' check (
    evidence_class in (
      'MEASURED', 'USER_CONFIRMED', 'DIRECTLY_OBSERVED',
      'DOCUMENTED', 'INFERRED', 'UNKNOWN'
    )
  ),
  source_type text,
  source_id text,
  source_conversation_id text references public.pierrot_conversations(id) on delete set null,
  source_message_id text references public.pierrot_messages(id) on delete set null,
  confidence real not null default 0.7 check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists pierrot_project_events_project_time_idx
  on public.pierrot_project_events (project_id, occurred_at desc);

create index if not exists pierrot_project_events_owner_time_idx
  on public.pierrot_project_events (owner_user_id, occurred_at desc);

create index if not exists pierrot_project_events_source_idx
  on public.pierrot_project_events (owner_user_id, source_message_id);

create table if not exists public.pierrot_project_status_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text not null default '',
  evidence_class text not null default 'USER_CONFIRMED' check (
    evidence_class in (
      'MEASURED', 'USER_CONFIRMED', 'DIRECTLY_OBSERVED',
      'DOCUMENTED', 'INFERRED', 'UNKNOWN'
    )
  ),
  source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array'),
  changed_at timestamptz not null default now()
);

create index if not exists pierrot_project_status_history_project_idx
  on public.pierrot_project_status_history (project_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 4. Brain retrieval indexes
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists knowledge_documents_title_trgm_idx
      on public.knowledge_documents using gin (title gin_trgm_ops)';
    execute 'create index if not exists knowledge_chunks_content_trgm_idx
      on public.knowledge_chunks using gin (content gin_trgm_ops)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privacy and service-role access
-- ---------------------------------------------------------------------------

alter table public.pierrot_entities enable row level security;
alter table public.pierrot_entity_relations enable row level security;
alter table public.pierrot_project_events enable row level security;
alter table public.pierrot_project_status_history enable row level security;

revoke all on table
  public.pierrot_entities,
  public.pierrot_entity_relations,
  public.pierrot_project_events,
  public.pierrot_project_status_history
from public, anon, authenticated;

grant all on table
  public.pierrot_entities,
  public.pierrot_entity_relations,
  public.pierrot_project_events,
  public.pierrot_project_status_history
to service_role;

comment on table public.pierrot_entities is
  'Owner-only typed entities. PROJECT points at pierrot_projects; BOOK/WORK/SERIES/etc. remain distinct.';
comment on table public.pierrot_entity_relations is
  'Explicit directed relations between typed entities, with evidence class and confidence.';
comment on table public.pierrot_project_events is
  'Append-only project timeline. Each row keeps the original source reference and evidence class.';
comment on table public.pierrot_project_status_history is
  'Append-only project status changes. Historical states are never overwritten.';
comment on column public.pierrot_messages.ingested_at is
  'When the system stored the message. created_at remains the event time.';
