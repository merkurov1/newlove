-- Rollback for 2026-12-14_youtube_management.sql
DROP TABLE IF EXISTS public.youtube_management_audit;

ALTER TABLE public.analytics_connections
  DROP COLUMN IF EXISTS management_token_ciphertext,
  DROP COLUMN IF EXISTS management_token_iv,
  DROP COLUMN IF EXISTS management_token_tag,
  DROP COLUMN IF EXISTS management_token_key_version;
