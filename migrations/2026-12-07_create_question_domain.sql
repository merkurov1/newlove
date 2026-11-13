-- ============================================================================
-- Question — private human answers and saved Pierrot syntheses
-- Date: 2026-12-07
--
-- Product contract:
--   * one random active question is shown at /question;
--   * a user may submit exactly one answer per question;
--   * human answers are never public;
--   * Pierrot's synthesis is generated only when the answer corpus changes;
--   * the previous synthesis remains readable while a new one is generated.
--
-- Privacy model:
--   * RLS is enabled on all three tables;
--   * anon and authenticated have no table privileges at all;
--   * only server-side service_role can read/write these tables;
--   * the public page RPC returns question text + synthesis only, never answers.
--
-- Generation model:
--   * question_syntheses doubles as the generation queue and lock row;
--   * question_claim_synthesis() atomically claims one generation with a UUID
--     token and a 5-minute lease;
--   * question_complete_synthesis() accepts a write only from the current token;
--   * dirty=true marks answers that arrived during a running generation.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question text not null
    check (char_length(btrim(question)) between 3 and 500),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  constraint questions_question_unique unique (question)
);

create table if not exists public.question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.questions(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  content text not null
    check (char_length(content) between 25 and 6000),
  word_count integer not null
    check (word_count between 25 and 900),
  created_at timestamptz not null default now(),
  constraint question_answers_question_user_unique unique (question_id, user_id)
);

create table if not exists public.question_syntheses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique
    references public.questions(id) on delete cascade,
  content text
    check (content is null or char_length(content) between 1 and 20000),
  answer_count integer not null default 0
    check (answer_count >= 0),
  corpus_count integer not null default 0
    check (corpus_count >= 0),
  version integer not null default 0
    check (version >= 0),
  status text not null default 'idle'
    check (status in ('idle', 'queued', 'running', 'error')),
  dirty boolean not null default false,
  attempts integer not null default 0
    check (attempts >= 0),
  next_attempt_at timestamptz,
  generation_claimed_at timestamptz,
  generation_token uuid,
  last_error text
    check (last_error is null or char_length(last_error) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.questions is
  'Question bank. Rows are maintained directly in Supabase; there is no admin UI.';
comment on table public.question_answers is
  'PRIVATE human answers. No anon/authenticated grants. Read only by server-side service_role.';
comment on table public.question_syntheses is
  'Saved Pierrot synthesis plus the single-flight generation queue for one question.';

alter table public.questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.question_syntheses enable row level security;

revoke all on table public.questions from public, anon, authenticated;
revoke all on table public.question_answers from public, anon, authenticated;
revoke all on table public.question_syntheses from public, anon, authenticated;

grant all on table public.questions to service_role;
grant all on table public.question_answers to service_role;
grant all on table public.question_syntheses to service_role;

-- ----------------------------------------------------------------------------
-- Atomic answer submission.
-- The active-question check, duplicate check and insert happen in one
-- statement set. A duplicate never updates the original answer.
-- ----------------------------------------------------------------------------
create or replace function public.question_submit_answer(
  p_question_id uuid,
  p_user_id uuid,
  p_content text,
  p_word_count integer
)
returns table (submitted boolean, reason text, corpus_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer := 0;
  v_count integer := 0;
begin
  if p_question_id is null or p_user_id is null then
    return query select false, 'invalid', 0;
    return;
  end if;

  if p_content is null
     or char_length(btrim(p_content)) < 25
     or char_length(p_content) > 6000
     or p_word_count is null
     or p_word_count < 25
     or p_word_count > 900 then
    return query select false, 'invalid', 0;
    return;
  end if;

  if not exists (
    select 1
    from public.questions q
    where q.id = p_question_id
      and q.status = 'active'
  ) then
    return query select false, 'inactive', 0;
    return;
  end if;

  insert into public.question_answers (question_id, user_id, content, word_count)
  values (p_question_id, p_user_id, btrim(p_content), p_word_count)
  on conflict (question_id, user_id) do nothing;

  get diagnostics v_rows = row_count;

  select count(*)::integer
    into v_count
    from public.question_answers a
   where a.question_id = p_question_id;

  if v_rows = 0 then
    return query select false, 'already_answered', v_count;
    return;
  end if;

  return query select true, 'submitted', v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Record that the corpus changed. Called in a separate transaction from the
-- answer insert, so a queue problem can never roll the human answer back.
--
-- A running generation is never interrupted: dirty=true asks the current
-- worker to run one more pass after it commits its result.
-- ----------------------------------------------------------------------------
create or replace function public.question_record_answer(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_question_id is null then return; end if;

  select count(*)::integer
    into v_count
    from public.question_answers a
   where a.question_id = p_question_id;

  insert into public.question_syntheses (
    question_id,
    answer_count,
    corpus_count,
    status
  )
  values (p_question_id, 0, v_count, 'queued')
  on conflict (question_id) do update
    set corpus_count = excluded.corpus_count,
        status = case
          when public.question_syntheses.status = 'running' then 'running'
          else 'queued'
        end,
        dirty = case
          when public.question_syntheses.status = 'running' then true
          else false
        end,
        next_attempt_at = case
          when public.question_syntheses.status = 'running'
            then public.question_syntheses.next_attempt_at
          else now()
        end,
        attempts = case
          when public.question_syntheses.status = 'running'
            then public.question_syntheses.attempts
          else 0
        end,
        last_error = case
          when public.question_syntheses.status = 'running'
            then public.question_syntheses.last_error
          else null
        end,
        updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Single-flight claim. At most one caller can move a question into 'running'.
-- A stale lease (crashed function) can be recovered after five minutes.
-- ----------------------------------------------------------------------------
create or replace function public.question_claim_synthesis(
  p_question_id uuid,
  p_generation_token uuid
)
returns table (
  generation_token uuid,
  synthesis_version integer,
  corpus_count integer,
  attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := coalesce(p_generation_token, gen_random_uuid());
begin
  if p_question_id is null then return; end if;

  return query
  update public.question_syntheses s
     set status = 'running',
         generation_token = v_token,
         generation_claimed_at = now(),
         attempts = s.attempts + 1,
         dirty = false,
         updated_at = now()
   where s.question_id = p_question_id
     and s.attempts < 8
     and (
       (
         s.status in ('queued', 'error')
         and (s.next_attempt_at is null or s.next_attempt_at <= now())
       )
       or (
         s.status = 'running'
         and s.generation_claimed_at is not null
         and s.generation_claimed_at < now() - interval '5 minutes'
       )
     )
  returning s.generation_token, s.version, s.corpus_count, s.attempts;
end;
$$;

-- ----------------------------------------------------------------------------
-- Commit a synthesis only if this caller still owns the generation token.
-- Returns dirty=true when new answers arrived during generation.
-- ----------------------------------------------------------------------------
create or replace function public.question_complete_synthesis(
  p_question_id uuid,
  p_generation_token uuid,
  p_content text,
  p_answer_count integer
)
returns table (
  completed boolean,
  dirty boolean,
  synthesis_version integer,
  synthesis_content text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dirty boolean := false;
  v_version integer := 0;
begin
  if p_question_id is null
     or p_generation_token is null
     or p_content is null
     or char_length(btrim(p_content)) < 1
     or char_length(p_content) > 20000 then
    return query select false, false, 0, null::text;
    return;
  end if;

  select s.dirty, s.version
    into v_dirty, v_version
    from public.question_syntheses s
   where s.question_id = p_question_id
     and s.generation_token = p_generation_token
     for update;

  if not found then
    return query select false, false, 0, null::text;
    return;
  end if;

  update public.question_syntheses s
     set content = btrim(p_content),
         answer_count = greatest(coalesce(p_answer_count, 0), 0),
         version = v_version + 1,
         status = case when v_dirty then 'queued' else 'idle' end,
         dirty = false,
         attempts = 0,
         next_attempt_at = case when v_dirty then now() else null end,
         generation_claimed_at = null,
         generation_token = null,
         last_error = null,
         updated_at = now()
   where s.question_id = p_question_id
     and s.generation_token = p_generation_token;

  return query select true, v_dirty, v_version + 1, btrim(p_content);
end;
$$;

-- ----------------------------------------------------------------------------
-- Bounded retry backoff. The previous synthesis is untouched on failure.
-- ----------------------------------------------------------------------------
create or replace function public.question_fail_synthesis(
  p_question_id uuid,
  p_generation_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer := 1;
begin
  if p_question_id is null or p_generation_token is null then
    return false;
  end if;

  select s.attempts
    into v_attempts
    from public.question_syntheses s
   where s.question_id = p_question_id
     and s.generation_token = p_generation_token
     for update;

  if not found then return false; end if;

  update public.question_syntheses s
     set status = 'error',
         last_error = left(coalesce(nullif(btrim(p_error_code), ''), 'generation_failed'), 120),
         next_attempt_at = now() + make_interval(
           secs => least(
             3600,
             60 * power(2, least(greatest(v_attempts, 1), 5))
           )
         ),
         generation_claimed_at = null,
         generation_token = null,
         updated_at = now()
   where s.question_id = p_question_id
     and s.generation_token = p_generation_token;

  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- Public read boundary. This is the only question-corpus-adjacent function
-- exposed to the server application for the public page.
-- ----------------------------------------------------------------------------
create or replace function public.question_public_page(
  p_question_id uuid default null
)
returns table (
  id uuid,
  question text,
  synthesis_content text,
  synthesis_updated_at timestamptz,
  synthesis_version integer,
  has_answers boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    q.id,
    q.question,
    s.content as synthesis_content,
    s.updated_at as synthesis_updated_at,
    coalesce(s.version, 0) as synthesis_version,
    exists (
      select 1
      from public.question_answers a
      where a.question_id = q.id
    ) as has_answers
  from public.questions q
  left join public.question_syntheses s on s.question_id = q.id
  where q.status = 'active'
    and (p_question_id is null or q.id = p_question_id)
  order by random()
  limit 1;
$$;

revoke all on function public.question_submit_answer(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.question_record_answer(uuid)
  from public, anon, authenticated;
revoke all on function public.question_claim_synthesis(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.question_complete_synthesis(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.question_fail_synthesis(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.question_public_page(uuid)
  from public, anon, authenticated;

grant execute on function public.question_submit_answer(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.question_record_answer(uuid)
  to service_role;
grant execute on function public.question_claim_synthesis(uuid, uuid)
  to service_role;
grant execute on function public.question_complete_synthesis(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.question_fail_synthesis(uuid, uuid, text)
  to service_role;
grant execute on function public.question_public_page(uuid)
  to service_role;

commit;
