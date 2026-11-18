-- ============================================================================
-- Question — align the repository schema with the production text limit
-- Date: 2026-12-11
--
-- Production already accepts verbatim restored questions up to 2000 characters.
-- The original 2026-12-07 domain migration documented a stricter 3..500 limit,
-- so a fresh environment would reject rows that production accepts.
--
-- This migration only replaces the question-length CHECK constraint. It does
-- not read or modify question, answer or synthesis content.
--
-- Idempotent: the DO block removes any previous question-length check (whatever
-- PostgreSQL named it) before the stable constraint is added.
-- ============================================================================

begin;

do $$
declare
  existing_constraint record;
begin
  for existing_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.questions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length%'
      and pg_get_constraintdef(oid) ilike '%question%'
  loop
    execute format(
      'alter table public.questions drop constraint %I',
      existing_constraint.conname
    );
  end loop;
end;
$$;

alter table public.questions
  add constraint questions_question_length_check
  check (char_length(btrim(question)) between 3 and 2000) not valid;

alter table public.questions
  validate constraint questions_question_length_check;

comment on constraint questions_question_length_check on public.questions is
  'Verbatim question text must be 3-2000 characters, matching production.';

commit;
