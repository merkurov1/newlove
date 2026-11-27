-- Rollback for 2026-11-27_cast_privacy_idempotency.sql
--
-- This restores the previous schema shape. It intentionally does NOT recreate
-- the permissive casts policies and never touches cast data.

begin;

drop function if exists public.consume_rate_limit(text, integer, integer);
drop table if exists public.rate_limit_counters;

drop index if exists public.casts_idempotency_key_uidx;
drop index if exists public.casts_status_created_at_idx;

alter table if exists public.casts
  drop column if exists email_delivered_at,
  drop column if exists email_delivery_status,
  drop column if exists capture_consumed_at,
  drop column if exists capture_token_expires_at,
  drop column if exists capture_token_nonce,
  drop column if exists analysis_metadata,
  drop column if exists idempotency_key,
  drop column if exists retention_consent,
  drop column if exists status;

commit;
