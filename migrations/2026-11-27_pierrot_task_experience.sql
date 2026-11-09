-- ============================================================================
-- Pierrot task classification experience
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Why a dedicated table is needed:
--   * pierrot_decisions stores the final record, but cannot store a rejected
--     classification where no record was created;
--   * pierrot_decision_events requires a decision_id and is an audit log for an
--     existing record;
--   * pierrot_workspace_proposals stores one plan, but not the subsequent
--     feedback/correction of an ordinary chat message.
--
-- This table is append-only examples, not model training. The analyzer reads it
-- as retrieval context and never changes stored records from it automatically.
-- ============================================================================

begin;

create table if not exists public.pierrot_task_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text,
  source_message_id text,
  source_text text,
  proposed_kind text,
  confirmed_kind text,
  proposed_project_id uuid references public.pierrot_projects (id) on delete set null,
  confirmed_project_id uuid references public.pierrot_projects (id) on delete set null,
  outcome text not null check (
    outcome in (
      'confirmed',
      'false_task',
      'missed_task',
      'duplicate',
      'wrong_status',
      'wrong_project',
      'wrong_kind',
      'display_error'
    )
  ),
  reason text,
  source text not null default 'grooming' check (
    source in ('grooming', 'chat_correction', 'feedback', 'manual')
  ),
  analyzer_version text not null default 'task-analyzer-v2',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists pierrot_task_experiences_user_created_idx
  on public.pierrot_task_experiences (user_id, created_at desc);
create index if not exists pierrot_task_experiences_user_outcome_idx
  on public.pierrot_task_experiences (user_id, outcome, created_at desc);
create index if not exists pierrot_task_experiences_source_message_idx
  on public.pierrot_task_experiences (source_message_id)
  where source_message_id is not null;

alter table public.pierrot_task_experiences enable row level security;

revoke all on table public.pierrot_task_experiences from public, anon, authenticated;
grant all on table public.pierrot_task_experiences to service_role;

comment on table public.pierrot_task_experiences is
  'Append-only owner corrections and confirmations used as retrieval examples for task classification. Never used to mutate records automatically.';

commit;
