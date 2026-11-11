-- Rollback: Pierrot unified context engine
-- Date: 2026-12-03
--
-- DESTRUCTIVE ONLY FOR OBJECTS ADDED BY 2026-12-03_pierrot_context_engine.sql.
-- It never deletes conversations, messages, projects, decisions or Brain data.
--
-- STOP: export the four new tables first if they contain production events
-- that must be preserved:
--   pg_dump --data-only --table=public.pierrot_entities ...
--
-- The ingested_at column is new. Dropping it loses ingestion timestamps only;
-- created_at (the original event time) is untouched.

drop index if exists public.knowledge_chunks_content_trgm_idx;
drop index if exists public.knowledge_documents_title_trgm_idx;
drop index if exists public.pierrot_project_status_history_project_idx;
drop index if exists public.pierrot_project_events_source_idx;
drop index if exists public.pierrot_project_events_owner_time_idx;
drop index if exists public.pierrot_project_events_project_time_idx;
drop index if exists public.pierrot_entity_relations_to_idx;
drop index if exists public.pierrot_entity_relations_from_idx;
drop index if exists public.pierrot_entities_project_idx;
drop index if exists public.pierrot_entities_owner_type_idx;

drop table if exists public.pierrot_project_status_history;
drop table if exists public.pierrot_project_events;
drop table if exists public.pierrot_entity_relations;
drop table if exists public.pierrot_entities;

drop index if exists public.pierrot_messages_content_trgm_idx;
drop index if exists public.pierrot_messages_conversation_created_idx;
drop index if exists public.pierrot_messages_created_at_idx;

alter table public.pierrot_messages
  drop column if exists ingested_at;
