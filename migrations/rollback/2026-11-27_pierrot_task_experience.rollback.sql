-- Rollback for 2026-11-27_pierrot_task_experience.sql
-- Removes only the append-only learning examples. No task, project, memory,
-- conversation or message row is touched.

begin;

drop table if exists public.pierrot_task_experiences;

commit;
