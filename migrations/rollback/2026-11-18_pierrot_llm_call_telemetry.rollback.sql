-- Rollback for 2026-11-18_pierrot_llm_call_telemetry.sql
-- DESTRUCTIVE: drops recorded telemetry. Review before use.

DROP TABLE IF EXISTS public.pierrot_llm_calls;
