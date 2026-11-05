-- Migration: Pierrot Skill Foundry — saved work analyses
-- Date: 2026-11-20
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- Analyses are explicit, owner-triggered reports built from real work history.
-- They are not model memory, not skills and not a background process. Saving a
-- report prevents recomputing it every time the SKILLS page opens.

create table if not exists public.pierrot_skill_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed'
    check (status in ('completed', 'partial', 'failed')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array'),
  report jsonb not null
    check (jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists pierrot_skill_analyses_user_created_idx
  on public.pierrot_skill_analyses (user_id, created_at desc);

alter table public.pierrot_skill_analyses enable row level security;

revoke all on table public.pierrot_skill_analyses from public, anon, authenticated;
grant all on table public.pierrot_skill_analyses to service_role;

comment on table public.pierrot_skill_analyses is
  'Owner-only saved Skill Foundry work analyses. Explicit, bounded and not a background job.';

comment on column public.pierrot_skill_analyses.report is
  'Deterministic report derived from owner chat, memory and Dev Mode evidence; source statuses are part of the report.';
