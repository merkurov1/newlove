-- Data repair: archive the accidental duplicate Heart & Angel project created
-- from the whole sentence on 2026-11-06.
--
-- STATUS: PREPARED ONLY. Review in production before applying. Do not run
-- automatically.
--
-- The malformed row is:
--   id:   aff91843-4c1d-4a63-8d1a-0f0c7ab354b2
--   name: Heart & Angel и там добавь задачу - опустить шарик с сердечком...
--
-- The correct project is `heart-and-angel` (a8c7c7ca-9f06-43b5-8857-...).
-- This repair preserves every row and relation. It only marks the malformed
-- shell as archived so it no longer appears as an active workspace.
--
-- Preconditions checked:
--   * no pierrot_project_decisions rows reference the malformed project;
--   * no pierrot_project_conversations rows reference it.
--
-- Rollback:
--   migrations/rollback/2026-11-23_pierrot_duplicate_project_repair.rollback.sql

update public.pierrot_projects
set
  status = 'archived',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'repair_reason', 'accidental duplicate created from a full chat sentence',
    'canonical_project_id', 'a8c7c7ca-9f06-43b5-8857-d3829a2ebcab',
    'repair_date', '2026-11-23'
  ),
  updated_at = now()
where id = 'aff91843-4c1d-4a63-8d1a-0f0c7ab354b2'
  and slug = 'heart-angel'
  and name like 'Heart & Angel и там добавь задачу%'
  and not exists (
    select 1
    from public.pierrot_project_decisions d
    where d.project_id = 'aff91843-4c1d-4a63-8d1a-0f0c7ab354b2'
  )
  and not exists (
    select 1
    from public.pierrot_project_conversations c
    where c.project_id = 'aff91843-4c1d-4a63-8d1a-0f0c7ab354b2'
  );

-- Verification (read-only):
--   select id, slug, name, status, metadata
--   from public.pierrot_projects
--   where id in (
--     'aff91843-4c1d-4a63-8d1a-0f0c7ab354b2',
--     'a8c7c7ca-9f06-43b5-8857-d3829a2ebcab'
--   );
