-- ============================================================================
-- Pierrot GitHub write confirmations
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- A GitHub write is never executed from the model. The chat bridge stores one
-- pending proposal here, shows the exact target repository/branch/payload, and
-- executes it only after an explicit owner confirmation on a later turn.
--
-- Access is service-role only: no anon/authenticated policies are created.
-- Read-only GitHub tools work without this migration; write confirmation
-- returns a migration_required status until it is applied.
-- ============================================================================

begin;

create table if not exists public.pierrot_github_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id text not null,
  repository text not null check (repository in ('newlove', 'pierrot')),
  operation text not null check (
    operation in (
      'create_issue',
      'create_branch',
      'create_pull_request',
      'create_or_update_file',
      'update_issue_state',
      'add_issue_comment'
    )
  ),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 262144),
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  executed_at timestamptz,
  result jsonb,
  constraint pierrot_github_operations_expiry_check check (expires_at > created_at)
);

create index if not exists pierrot_github_operations_pending_idx
  on public.pierrot_github_operations (user_id, conversation_id, status, created_at desc);

create index if not exists pierrot_github_operations_expiry_idx
  on public.pierrot_github_operations (expires_at)
  where status = 'pending';

alter table public.pierrot_github_operations enable row level security;

revoke all on public.pierrot_github_operations from anon;
revoke all on public.pierrot_github_operations from authenticated;

comment on table public.pierrot_github_operations is
  'Service-role-only pending GitHub write confirmations. The token is never stored here; payloads contain only the target repo, branch, path/title and text supplied by the owner.';

commit;
