-- Rollback for 2026-12-08_question_dashboard.sql

begin;

drop function if exists public.question_dashboard_stats();

commit;
