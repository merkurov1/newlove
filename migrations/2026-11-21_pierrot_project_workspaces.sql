-- Pierrot persistent owner workspaces.
-- Additive only. Prepare and review before applying to Supabase production.

create extension if not exists pgcrypto;

create table if not exists public.pierrot_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  objective text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  priority integer not null default 0 check (priority between 0 and 100),
  project_brief text not null default '',
  brief_revision integer not null default 1 check (brief_revision > 0),
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slug)
);

create index if not exists pierrot_projects_owner_activity_idx
  on public.pierrot_projects (owner_user_id, status, last_activity_at desc);

create table if not exists public.pierrot_project_brief_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  revision integer not null,
  brief text not null,
  change_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

create table if not exists public.pierrot_project_conversations (
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  conversation_id text not null references public.pierrot_conversations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, conversation_id)
);
create index if not exists pierrot_project_conversations_conversation_idx
  on public.pierrot_project_conversations (conversation_id);

create table if not exists public.pierrot_project_decisions (
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  decision_id uuid not null references public.pierrot_decisions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, decision_id)
);

create table if not exists public.pierrot_project_knowledge (
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  document_id text not null references public.knowledge_documents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, document_id)
);

create table if not exists public.pierrot_project_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pierrot_projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  artifact_type text not null default 'document',
  content text not null default '',
  source_conversation_id text references public.pierrot_conversations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pierrot_project_artifacts_project_idx
  on public.pierrot_project_artifacts (project_id, updated_at desc);

alter table public.pierrot_dev_prompts
  add column if not exists project_id uuid references public.pierrot_projects(id) on delete set null;
create index if not exists pierrot_dev_prompts_project_idx
  on public.pierrot_dev_prompts (project_id, updated_at desc);

alter table public.pierrot_projects enable row level security;
alter table public.pierrot_project_brief_revisions enable row level security;
alter table public.pierrot_project_conversations enable row level security;
alter table public.pierrot_project_decisions enable row level security;
alter table public.pierrot_project_knowledge enable row level security;
alter table public.pierrot_project_artifacts enable row level security;

revoke all on table public.pierrot_projects, public.pierrot_project_brief_revisions,
  public.pierrot_project_conversations, public.pierrot_project_decisions,
  public.pierrot_project_knowledge, public.pierrot_project_artifacts from public, anon, authenticated;
grant all on table public.pierrot_projects, public.pierrot_project_brief_revisions,
  public.pierrot_project_conversations, public.pierrot_project_decisions,
  public.pierrot_project_knowledge, public.pierrot_project_artifacts to service_role;

comment on table public.pierrot_projects is 'Private owner project workspaces; distinct from public projects.';
comment on column public.pierrot_projects.project_brief is 'Reviewed, concise project context; not a conversation transcript.';
