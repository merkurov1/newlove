-- Migration: Pierrot Decision Observatory runs
-- Date: 2026-11-19
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- The observatory is manual. There is no cron, scheduled job or background
-- worker. Each run stores one deterministic report. Decisions and events are
-- read from the existing pierrot_decisions and pierrot_decision_events tables.

create table if not exists public.pierrot_decision_observatory_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  decision_count integer not null default 0,
  event_count integer not null default 0,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pierrot_observatory_runs_user_idx
  on public.pierrot_decision_observatory_runs (user_id, generated_at desc);

alter table public.pierrot_decision_observatory_runs enable row level security;

revoke all on table public.pierrot_decision_observatory_runs from anon, authenticated;
grant all on table public.pierrot_decision_observatory_runs to service_role;

comment on table public.pierrot_decision_observatory_runs is
  'Owner-only manual Decision Observatory reports. No automatic runs.';
