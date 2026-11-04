-- Migration: expand Pierrot owner memory kinds and statuses
-- Date: 2026-11-17
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Existing production table `public.pierrot_decisions` already has:
--   kind, title, content, rationale, status, project, tags, source_refs,
--   conversation_id, message_id, superseded_by, decided_at, review_at,
--   created_at, updated_at.
--
-- The three owner-memory categories use the same table:
--   memory   — durable preference/fact/principle
--   saved    — temporary note
--   reminder — deferred task/thought (review_at = optional due date)
--
-- The existing kind/status checks do not allow those values, so this migration
-- only expands the two constraints and adds a reminder lookup index. It does
-- not create a duplicate table, rewrite rows or change RLS.

alter table public.pierrot_decisions
  drop constraint if exists pierrot_decisions_kind_check;

alter table public.pierrot_decisions
  add constraint pierrot_decisions_kind_check
  check (
    kind = any (
      array[
        'decision',
        'position',
        'preference',
        'constraint',
        'task',
        'rejected_recommendation',
        'memory',
        'saved',
        'reminder'
      ]::text[]
    )
  );

alter table public.pierrot_decisions
  drop constraint if exists pierrot_decisions_status_check;

alter table public.pierrot_decisions
  add constraint pierrot_decisions_status_check
  check (
    status = any (
      array[
        'current',
        'superseded',
        'rejected',
        'uncertain',
        'completed',
        'archived'
      ]::text[]
    )
  );

create index if not exists pierrot_decisions_user_kind_status_idx
  on public.pierrot_decisions (user_id, kind, status, updated_at desc);

create index if not exists pierrot_decisions_user_review_idx
  on public.pierrot_decisions (user_id, review_at)
  where review_at is not null;

comment on table public.pierrot_decisions is
  'Owner-only Pierrot decisions, durable memory, saved notes and reminders. Access is service-role only; RLS has no public policies.';
