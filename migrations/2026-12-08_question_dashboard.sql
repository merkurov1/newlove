-- ============================================================================
-- Question — owner dashboard aggregate read
-- Date: 2026-12-08
--
-- Returns one row per question with counts and synthesis state only.
-- It never returns human answer text, user ids, emails or profiles.
-- ============================================================================

begin;

create or replace function public.question_dashboard_stats()
returns table (
  question_id uuid,
  question text,
  status text,
  answer_count integer,
  first_answer_at timestamptz,
  last_answer_at timestamptz,
  synthesis_status text,
  synthesis_version integer,
  synthesis_answer_count integer,
  synthesis_updated_at timestamptz,
  synthesis_last_error text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    q.id as question_id,
    q.question,
    q.status,
    (
      select count(*)::integer
      from public.question_answers a
      where a.question_id = q.id
    ) as answer_count,
    (
      select min(a.created_at)
      from public.question_answers a
      where a.question_id = q.id
    ) as first_answer_at,
    (
      select max(a.created_at)
      from public.question_answers a
      where a.question_id = q.id
    ) as last_answer_at,
    coalesce(s.status, 'missing') as synthesis_status,
    coalesce(s.version, 0) as synthesis_version,
    coalesce(s.answer_count, 0) as synthesis_answer_count,
    s.updated_at as synthesis_updated_at,
    s.last_error as synthesis_last_error
  from public.questions q
  left join public.question_syntheses s on s.question_id = q.id
  order by q.created_at asc, q.id asc;
$$;

revoke all on function public.question_dashboard_stats()
  from public, anon, authenticated;

grant execute on function public.question_dashboard_stats()
  to service_role;

commit;
