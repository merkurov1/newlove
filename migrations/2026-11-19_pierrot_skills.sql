-- Migration: Pierrot Skill Foundry
-- Date: 2026-11-19
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- Skills are separate from memory and from Brain documents. A skill stores a
-- repeatable procedure, its safety conditions and its control tests. Version
-- rows are immutable; approval switches the current version instead of silently
-- overwriting a tested one.

create table if not exists public.pierrot_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'active', 'disabled', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.pierrot_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.pierrot_skills(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version >= 1),
  definition jsonb not null,
  changelog text,
  status text not null default 'draft'
    check (status in ('draft', 'testing', 'active', 'disabled', 'archived')),
  created_at timestamptz not null default now(),
  unique (skill_id, version)
);

create table if not exists public.pierrot_skill_runs (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.pierrot_skills(id) on delete cascade,
  version_id uuid not null references public.pierrot_skill_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('passed', 'failed')),
  checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pierrot_skills_user_status_idx
  on public.pierrot_skills (user_id, status, updated_at desc);

create index if not exists pierrot_skill_versions_skill_idx
  on public.pierrot_skill_versions (skill_id, version desc);

create index if not exists pierrot_skill_runs_version_idx
  on public.pierrot_skill_runs (version_id, created_at desc);

alter table public.pierrot_skills enable row level security;
alter table public.pierrot_skill_versions enable row level security;
alter table public.pierrot_skill_runs enable row level security;

revoke all on table public.pierrot_skills from anon, authenticated;
revoke all on table public.pierrot_skill_versions from anon, authenticated;
revoke all on table public.pierrot_skill_runs from anon, authenticated;

grant all on table public.pierrot_skills to service_role;
grant all on table public.pierrot_skill_versions to service_role;
grant all on table public.pierrot_skill_runs to service_role;

comment on table public.pierrot_skills is
  'Owner-only Skill Foundry registry. Skills describe procedures, not facts, and never grant permissions.';

comment on table public.pierrot_skill_versions is
  'Immutable skill versions. Approval selects a tested version; history is never deleted.';

comment on table public.pierrot_skill_runs is
  'Deterministic control-test results for skill versions.';
