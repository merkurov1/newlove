-- Rollback: typed entity backfill from the Brain corpus
-- Date: 2026-12-04
--
-- Removes only rows created by 2026-12-04_pierrot_entity_backfill.sql.
-- It does not delete knowledge_documents, knowledge_chunks, projects or events.

delete from public.pierrot_entity_relations
where source_refs @> '[{"backfill":"entity_backfill_v1"}]'::jsonb;

delete from public.pierrot_entities
where metadata->>'backfill' = 'entity_backfill_v1';
