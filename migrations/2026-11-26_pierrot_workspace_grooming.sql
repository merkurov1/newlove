-- ============================================================================
-- Pierrot workspace grooming, approval and context summaries
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- This is a coordination layer over existing systems:
--   * tasks/decisions stay in pierrot_decisions;
--   * projects stay in pierrot_projects;
--   * conversations/messages stay in pierrot_conversations/pierrot_messages;
--   * GitHub reads/writes reuse the existing Dev client and credentials.
--
-- The new tables store only audit plans, proposal state, an execution journal,
-- versioned context summaries and local GitHub issue links.
-- Source messages, tasks, decisions and projects are never physically deleted.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Audit plan
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_workspace_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  project_id uuid references public.pierrot_projects (id) on delete set null,
  scope text not null default 'all'
    check (scope in ('all', 'conversations', 'projects', 'tasks', 'memory', 'github', 'context')),
  status text not null default 'prepared'
    check (status in ('prepared', 'approved', 'executing', 'completed', 'partial', 'failed', 'expired', 'cancelled')),
  request_message_id text,
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object'),
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  proposal_count integer not null default 0 check (proposal_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  approved_at timestamptz,
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pierrot_workspace_audits_expiry_check check (expires_at > created_at)
);

create unique index if not exists pierrot_workspace_audits_request_uidx
  on public.pierrot_workspace_audits (user_id, conversation_id, request_message_id)
  where request_message_id is not null;

create index if not exists pierrot_workspace_audits_pending_idx
  on public.pierrot_workspace_audits (user_id, conversation_id, status, created_at desc);

create index if not exists pierrot_workspace_audits_project_idx
  on public.pierrot_workspace_audits (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Proposals
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_workspace_proposals (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.pierrot_workspace_audits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  operation text not null check (
    operation in (
      'create_task', 'create_reminder', 'create_artifact',
      'complete_task', 'merge_tasks', 'reopen_task',
      'archive_task', 'move_task', 'reclassify_task', 'update_task',
      'link_github_issue',
      'create_memory', 'update_memory', 'merge_memory', 'archive_memory',
      'reclassify_memory',
      'link_project', 'update_project_context', 'update_project_summary',
      'create_issue', 'update_issue', 'link_pull_request', 'sync_remote_status',
      'create_context_summary', 'update_context_summary', 'archive_context_reference'
    )
  ),
  entity_type text not null default 'task'
    check (entity_type in ('task', 'memory', 'project', 'conversation', 'github_issue', 'github_pull_request')),
  entity_id text,
  project_id uuid references public.pierrot_projects (id) on delete set null,
  title text not null check (char_length(title) between 1 and 400),
  reason text not null default '',
  expected_result text not null default '',
  source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array'),
  params jsonb not null default '{}'::jsonb
    check (jsonb_typeof(params) = 'object'),
  before_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(before_state) = 'object'),
  confidence numeric(4, 3) not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  risk text not null default 'confirmation'
    check (risk in ('safe', 'reversible', 'confirmation')),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'skipped', 'stale')),
  selected boolean not null default false,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz,
  unique (audit_id, ordinal)
);

create index if not exists pierrot_workspace_proposals_audit_idx
  on public.pierrot_workspace_proposals (audit_id, ordinal);
create index if not exists pierrot_workspace_proposals_status_idx
  on public.pierrot_workspace_proposals (user_id, status, updated_at desc);

-- ---------------------------------------------------------------------------
-- 3. Execution journal
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_workspace_operations (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid references public.pierrot_workspace_audits (id) on delete set null,
  proposal_id uuid references public.pierrot_workspace_proposals (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  idempotency_key text,
  approval_at timestamptz,
  execution_at timestamptz not null default now(),
  result text not null check (result in ('executed', 'skipped', 'failed', 'stale')),
  error_details text,
  created_at timestamptz not null default now()
);

create unique index if not exists pierrot_workspace_operations_idempotency_uidx
  on public.pierrot_workspace_operations (idempotency_key)
  where idempotency_key is not null;

create index if not exists pierrot_workspace_operations_audit_idx
  on public.pierrot_workspace_operations (audit_id, created_at);
create index if not exists pierrot_workspace_operations_user_idx
  on public.pierrot_workspace_operations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Versioned conversation summaries
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_context_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null references public.pierrot_conversations (id) on delete cascade,
  version integer not null check (version > 0),
  summary text not null check (char_length(summary) between 1 and 20000),
  source_message_start_index bigint,
  source_message_end_index bigint,
  message_count integer not null default 0 check (message_count >= 0),
  previous_summary_id uuid references public.pierrot_context_summaries (id) on delete set null,
  generated_by text not null default 'deterministic',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (conversation_id, version)
);

create index if not exists pierrot_context_summaries_conversation_idx
  on public.pierrot_context_summaries (conversation_id, version desc);
create index if not exists pierrot_context_summaries_user_idx
  on public.pierrot_context_summaries (user_id, generated_at desc);

-- ---------------------------------------------------------------------------
-- 5. Local task ↔ GitHub issue links
-- ---------------------------------------------------------------------------

create table if not exists public.pierrot_github_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null references public.pierrot_decisions (id) on delete cascade,
  repository text not null,
  issue_number integer not null check (issue_number > 0),
  issue_url text,
  pull_request_number integer,
  pull_request_url text,
  last_state text,
  last_result text check (
    last_result is null
    or last_result in (
      'confirmed_done', 'partially_implemented', 'needs_verification',
      'still_open', 'not_found', 'sync_error'
    )
  ),
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, decision_id, repository, issue_number)
);

create index if not exists pierrot_github_task_links_decision_idx
  on public.pierrot_github_task_links (decision_id);
create index if not exists pierrot_github_task_links_sync_idx
  on public.pierrot_github_task_links (user_id, last_checked_at desc);

-- ---------------------------------------------------------------------------
-- 6. Privacy / access
-- ---------------------------------------------------------------------------

alter table public.pierrot_workspace_audits enable row level security;
alter table public.pierrot_workspace_proposals enable row level security;
alter table public.pierrot_workspace_operations enable row level security;
alter table public.pierrot_context_summaries enable row level security;
alter table public.pierrot_github_task_links enable row level security;

revoke all on table public.pierrot_workspace_audits,
  public.pierrot_workspace_proposals,
  public.pierrot_workspace_operations,
  public.pierrot_context_summaries,
  public.pierrot_github_task_links
  from public, anon, authenticated;

grant all on table public.pierrot_workspace_audits,
  public.pierrot_workspace_proposals,
  public.pierrot_workspace_operations,
  public.pierrot_context_summaries,
  public.pierrot_github_task_links
  to service_role;

comment on table public.pierrot_workspace_audits is
  'Owner-only prepared workspace audits. The first audit command never changes workspace data.';
comment on table public.pierrot_workspace_proposals is
  'Concrete, owner-reviewable operations produced by an audit. Execution requires explicit approval.';
comment on table public.pierrot_workspace_operations is
  'Append-only journal of approved workspace operations with before/after state.';
comment on table public.pierrot_context_summaries is
  'Versioned conversation summaries. Original pierrot_messages remain untouched and are the source of truth.';
comment on table public.pierrot_github_task_links is
  'Local task ↔ GitHub Issue/PR links used for reconciliation; no repository content is mirrored.';

commit;
