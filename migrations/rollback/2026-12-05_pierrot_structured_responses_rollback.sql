-- Rollback for 2026-12-05_pierrot_structured_responses.sql
-- Safe: structured payloads are optional. Dropping them leaves the Markdown
-- transcript intact.

drop index if exists public.pierrot_messages_metadata_response_idx;

alter table public.pierrot_messages
  drop constraint if exists pierrot_messages_metadata_object_check;

alter table public.pierrot_messages
  drop column if exists metadata;
