-- Rollback: Pierrot canonical project chat + project review reports
-- Date: 2026-11-24
--
-- WARNING: run the merge script with --restore-run=<run-id> first when a merge
-- was applied. Dropping the mapping table removes the automatic restore data.
--
-- This rollback removes only the additive structures. It never deletes
-- conversations, messages, events, projects, decisions or artifacts.

drop index if exists public.pierrot_projects_owner_conversation_idx;
drop index if exists public.pierrot_projects_conversation_uidx;

alter table public.pierrot_projects
  drop column if exists conversation_id;

drop table if exists public.pierrot_project_chat_merge_map;
drop table if exists public.pierrot_project_chat_migrations;
drop table if exists public.pierrot_project_reviews;
