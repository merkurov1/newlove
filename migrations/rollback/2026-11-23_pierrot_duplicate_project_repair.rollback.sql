-- Rollback for 2026-11-23_pierrot_duplicate_project_repair.sql
-- Restores only the archived status of the accidental project. No rows are
-- deleted by either the repair or this rollback.

update public.pierrot_projects
set
  status = 'active',
  metadata = coalesce(metadata, '{}'::jsonb) - 'repair_reason' - 'canonical_project_id' - 'repair_date',
  updated_at = now()
where id = 'aff91843-4c1d-4a63-8d1a-0f0c7ab354b2'
  and status = 'archived';
