-- Rollback for 2026-12-15_youtube_multichannel.sql
--
-- The legacy analytics_connections YouTube row is not modified by the forward
-- migration, so it keeps working after this rollback.

ALTER TABLE public.youtube_management_audit
  DROP COLUMN IF EXISTS changed_fields,
  DROP COLUMN IF EXISTS result_summary;

DROP TABLE IF EXISTS public.youtube_project_bindings;
DROP TABLE IF EXISTS public.youtube_channels;
DROP TABLE IF EXISTS public.youtube_oauth_connections;
