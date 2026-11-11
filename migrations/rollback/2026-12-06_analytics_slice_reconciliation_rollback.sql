-- Rollback: exact-slice reconciliation functions for website analytics
-- Date: 2026-12-06
-- Removes only the functions added by
-- 2026-12-06_analytics_slice_reconciliation.sql. No metric rows are changed.

drop function if exists public.analytics_replace_metric_slice(text, text[], date, date, jsonb);
drop function if exists public.analytics_replace_search_slice(text, date, date, jsonb);
