-- Pierrot canonical project chat + project review reports
-- Date: 2026-11-24
--
-- STATUS: PREPARED ONLY. Review on staging, run the dry-run merge script and
-- then apply this migration manually before enabling canonical project chats.
--
-- This migration is additive:
--   * one `conversation_id` per project (single source of truth);
--   * safe backfill only when a project has exactly one linked legacy chat;
--   * a project review report table with one-running-review protection;
--   * a merge mapping/backup table for the reviewed history migration.
--
-- It does not delete conversation rows, messages, events or project links.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Canonical project conversation
-- ---------------------------------------------------------------------------

alter table public.pierrot_projects
  add column if not exists conversation_id text
  references public.pierrot_conversations(id) on delete set null;

create unique index if not exists pierrot_projects_conversation_uidx
  on public.pierrot_projects (conversation_id)
  where conversation_id is not null;

create index if not exists pierrot_projects_owner_conversation_idx
  on public.pierrot_projects (owner_user_id, conversation_id);

-- Safe, unambiguous backfill only. Projects with zero or several linked
-- conversations stay null until the reviewed merge reports a target.
with linked as (
  select
    project_id,
    min(conversation_id::text)::text as only_conversation_id,
    count(distinct conversation_id) as conversation_count
  from public.pierrot_project_conversations
  group by project_id
),
safe as (
  select linked.project_id, linked.only_conversation_id
  from linked
  join public.pierrot_projects p on p.id = linked.project_id
  join public.pierrot_conversations c on c.id = linked.only_conversation_id
  where linked.conversation_count = 1
    and p.conversation_id is null
)
update public.pierrot_projects p
set conversation_id = safe.only_conversation_id,
    updated_at = now()
from safe
where p.id = safe.project_id
  and p.conversation_id is null;

-- ---------------------------------------------------------------------------
-- 2. Project review reports and summaries
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  request_message_id text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  reply text not null default '',
  summary text not null default '',
  report jsonb not null default '{}'::jsonb
    check (jsonb_typeof(report) = 'object'),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, request_message_id)
);

create index if not exists pierrot_project_reviews_project_idx
  on public.pierrot_project_reviews (project_id, completed_at desc);

create index if not exists pierrot_project_reviews_owner_idx
  on public.pierrot_project_reviews (owner_user_id, created_at desc);

-- At most one review may run for a project. The application turns this
-- constraint into a clear “already running” answer, never a second AI run.
create unique index if not exists pierrot_project_reviews_one_running_idx
  on public.pierrot_project_reviews (project_id)
  where status = 'running';

comment on table public.pierrot_project_reviews is
  'Owner-only project review reports. Each completed row is a preserved summary revision; no automatic/cron review.';

-- ---------------------------------------------------------------------------
-- 3. Reviewed project-chat merge + rollback mapping
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_project_chat_migrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_conversation_id text not null
    references public.pierrot_conversations(id) on delete restrict,
  status text not null default 'planned'
    check (status in ('planned', 'applied', 'failed', 'rolled_back')),
  report jsonb not null default '{}'::jsonb
    check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pierrot_project_chat_migrations_project_idx
  on public.pierrot_project_chat_migrations (project_id, created_at desc);

create table if not exists public.pierrot_project_chat_merge_map (
  id bigserial primary key,
  run_id uuid not null
    references public.pierrot_project_chat_migrations(id) on delete cascade,
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  source_conversation_id text not null,
  target_conversation_id text not null,
  original_message_index bigint not null,
  new_message_index bigint,
  original_row jsonb not null default '{}'::jsonb,
  skipped_duplicate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists pierrot_project_chat_merge_map_run_idx
  on public.pierrot_project_chat_merge_map (run_id);
create index if not exists pierrot_project_chat_merge_map_conversation_idx
  on public.pierrot_project_chat_merge_map (source_conversation_id, original_message_index);

comment on table public.pierrot_project_chat_merge_map is
  'Before/after mapping for every message moved by the project-chat merge. Used to restore the previous conversation structure.';

alter table public.pierrot_project_reviews enable row level security;
alter table public.pierrot_project_chat_migrations enable row level security;
alter table public.pierrot_project_chat_merge_map enable row level security;

revoke all on table public.pierrot_project_reviews,
  public.pierrot_project_chat_migrations,
  public.pierrot_project_chat_merge_map
  from public, anon, authenticated;

grant all on table public.pierrot_project_reviews,
  public.pierrot_project_chat_migrations,
  public.pierrot_project_chat_merge_map
  to service_role;

comment on column public.pierrot_projects.conversation_id is
  'The project’s one canonical conversation. Historical links stay in pierrot_project_conversations as provenance only.';
