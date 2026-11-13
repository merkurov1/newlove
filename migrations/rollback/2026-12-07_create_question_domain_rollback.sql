-- Rollback for 2026-12-07_create_question_domain.sql
-- WARNING: destroys the question bank, private human answers and saved syntheses.

begin;

drop function if exists public.question_public_page(uuid);
drop function if exists public.question_fail_synthesis(uuid, uuid, text);
drop function if exists public.question_complete_synthesis(uuid, uuid, text, integer);
drop function if exists public.question_claim_synthesis(uuid, uuid);
drop function if exists public.question_record_answer(uuid);
drop function if exists public.question_submit_answer(uuid, uuid, text, integer);

drop table if exists public.question_syntheses;
drop table if exists public.question_answers;
drop table if exists public.questions;

commit;
