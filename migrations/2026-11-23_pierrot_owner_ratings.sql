-- Migration: explicit owner ratings for Pierrot projects and tasks
-- Date: 2026-11-23
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- Why: `pierrot_projects.priority` is an internal ordering value and
-- `pierrot_decisions.importance/confidence` are model estimates. The owner's
-- explicit 1..10 rating must be stored separately so a model update can never
-- overwrite it.
--
-- Backward compatibility:
--   * additive nullable columns only;
--   * existing rows keep owner_rating = NULL (not rated);
--   * application reads fall back to the current schema when the columns are
--     absent and refuses to claim a rating was saved until this migration runs;
--   * no data is rewritten or deleted.
--
-- Rollback:
--   migrations/rollback/2026-11-23_pierrot_owner_ratings.rollback.sql

alter table public.pierrot_projects
  add column if not exists owner_rating smallint
    check (owner_rating between 1 and 10),
  add column if not exists owner_rating_updated_at timestamptz;

alter table public.pierrot_decisions
  add column if not exists owner_rating smallint
    check (owner_rating between 1 and 10),
  add column if not exists owner_rating_updated_at timestamptz;

comment on column public.pierrot_projects.owner_rating is
  'Explicit owner rating 1..10. Never written by model importance or priority.';
comment on column public.pierrot_decisions.owner_rating is
  'Explicit owner rating 1..10. Separate from model importance/confidence.';
