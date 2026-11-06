-- Rollback for 2026-11-23_pierrot_owner_ratings.sql
--
-- Removes only the nullable rating columns added by that migration. No other
-- data is touched. Run only after the application no longer writes/reads these
-- columns.

alter table public.pierrot_projects
  drop column if exists owner_rating_updated_at,
  drop column if exists owner_rating;

alter table public.pierrot_decisions
  drop column if exists owner_rating_updated_at,
  drop column if exists owner_rating;
