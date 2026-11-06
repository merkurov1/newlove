-- Migration: canonical owner project ↔ decision links
-- Date: 2026-11-22
--
-- STATUS: PREPARED ONLY. Do not apply automatically.
--
-- Existing decisions may carry a legacy text value in pierrot_decisions.project
-- while pierrot_project_decisions is empty. This migration:
--   1. backfills only exact, unambiguous name/slug matches;
--   2. does not guess or overwrite ambiguous legacy text;
--   3. leaves all existing rows intact.
--
-- New writes use pierrot_project_decisions as the canonical relation and keep
-- pierrot_decisions.project as a display mirror only.

with matches as (
  select
    d.id as decision_id,
    d.user_id,
    p.id as project_id
  from public.pierrot_decisions d
  join public.pierrot_projects p
    on p.owner_user_id = d.user_id
   and d.project is not null
   and btrim(d.project) <> ''
   and (
     lower(p.name) = lower(btrim(d.project))
     or lower(p.slug) = lower(btrim(d.project))
   )
  where d.user_id is not null
),
unique_matches as (
  select
    decision_id,
    user_id,
    min(project_id::text)::uuid as project_id
  from matches
  group by decision_id, user_id
  having count(*) = 1
)
insert into public.pierrot_project_decisions (
  project_id,
  decision_id,
  owner_user_id
)
select project_id, decision_id, user_id
from unique_matches
on conflict (project_id, decision_id) do nothing;

-- A decision should not belong to two projects at once. Prepared only; verify
-- existing duplicates before applying. The application also clears old links
-- before assigning a new project.
create unique index if not exists pierrot_project_decisions_single_project_idx
  on public.pierrot_project_decisions (owner_user_id, decision_id);

comment on index public.pierrot_project_decisions_single_project_idx is
  'One canonical project per owner decision; prevents two competing project links.';
